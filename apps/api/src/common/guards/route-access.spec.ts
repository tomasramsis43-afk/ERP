import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const ACCESS = /@(Public|RequirePermissions|AnyAuthenticated)\(/;
const ROUTE = /^ {2}@(Get|Post|Put|Patch|Delete)\(/gm;

/**
 * Returns "Controller.handler" labels of routes that carry no access rule, neither on the handler nor on the class.
 * The guard denies such routes at runtime; this test makes the omission fail in CI before it ships.
 */
export function routesWithoutAccessRule(source: string): string[] {
  const classStart = source.search(/^export class /m);
  const classRule = ACCESS.test(source.slice(0, classStart < 0 ? 0 : classStart));
  const missing: string[] = [];
  for (const m of source.matchAll(ROUTE)) {
    const at = m.index ?? 0;
    const before = source.slice(0, at);
    // The handler's decorator block starts after the previous method's closing brace (or the class opening line).
    const blockStart = Math.max(before.lastIndexOf('\n  }\n'), before.search(/\{\n(?!.*\{\n)/s) >= 0 ? before.lastIndexOf('{\n') : 0);
    const signatureEnd = source.indexOf('(', source.indexOf('\n', at + 1) >= 0 ? afterDecorators(source, at) : at);
    const block = source.slice(Math.max(blockStart, 0), signatureEnd);
    if (!classRule && !ACCESS.test(block)) {
      const name = /\n {2}(?:async\s+)?(\w+)\s*\(/.exec(source.slice(afterDecorators(source, at) - 1))?.[1] ?? '?';
      missing.push(name);
    }
  }
  return missing;
}

/** Index of the first line after the decorator lines that follow `at` (i.e. the method signature line). */
function afterDecorators(source: string, at: number): number {
  let i = source.indexOf('\n', at) + 1;
  while (/^ {2}@/.test(source.slice(i, i + 4)) || /^ {4}[^\s@]/.test(source.slice(i, i + 5)) && !/^ {2}(async\s+)?\w+\s*\(/.test(source.slice(i, i + 80))) {
    const next = source.indexOf('\n', i) + 1;
    if (next <= i) break;
    i = next;
  }
  return i;
}

function controllerFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? controllerFiles(p) : n.endsWith('.controller.ts') ? [p] : [];
  });
}

describe('route access rules', () => {
  it('detects a route that forgot its decorator', () => {
    const bad = `@Controller('x')\nexport class X {\n  @Get('a')\n  a() {}\n\n  @RequirePermissions('x:view')\n  @Get('b')\n  b() {}\n}\n`;
    expect(routesWithoutAccessRule(bad)).toEqual(['a']);
  });

  it('accepts a class-level rule and Public/AnyAuthenticated markers', () => {
    expect(routesWithoutAccessRule(`@RequirePermissions('x:view')\n@Controller('x')\nexport class X {\n  @Get('a')\n  a() {}\n}\n`)).toEqual([]);
    expect(routesWithoutAccessRule(`@Controller('x')\nexport class X {\n  @Public()\n  @Get('a')\n  a() {}\n\n  @AnyAuthenticated()\n  @Get('b')\n  b() {}\n}\n`)).toEqual([]);
  });

  it('every real controller route declares who may call it', () => {
    const offenders = controllerFiles(join(__dirname, '../../modules')).flatMap((f) =>
      routesWithoutAccessRule(readFileSync(f, 'utf8')).map((r) => `${f.split('/modules/')[1]}:${r}`),
    );
    expect(offenders).toEqual([]);
  });
});
