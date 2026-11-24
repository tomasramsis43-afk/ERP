import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, RequirePermissions } from '../../common/decorators/auth.decorators';
import { parsePage } from '../../common/utils/pagination';
import { CatalogService } from './catalog.service';
import {
  CreateCategoryDto,
  CreateProductDto,
  CreateUnitDto,
  SetCustomerPriceDto,
  UpdateProductDto,
} from './dto/catalog.dto';
import { ProductsService } from './products.service';

@ApiTags('catalog')
@ApiBearerAuth()
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService, private readonly products: ProductsService) {}

  @Get('units')
  @RequirePermissions('products:view')
  units() {
    return this.catalog.listUnits();
  }

  @Post('units')
  @RequirePermissions('products:create')
  createUnit(@Body() dto: CreateUnitDto, @CurrentUser() u: AuthUser) {
    return this.catalog.createUnit(dto, u.id);
  }

  @Get('product-categories')
  @RequirePermissions('products:view')
  categories() {
    return this.catalog.listCategories();
  }

  @Post('product-categories')
  @RequirePermissions('products:create')
  createCategory(@Body() dto: CreateCategoryDto, @CurrentUser() u: AuthUser) {
    return this.catalog.createCategory(dto, u.id);
  }

  @Get('products')
  @RequirePermissions('products:view')
  list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('q') q?: string,
    @Query('categoryId') categoryId?: string,
    @Query('active') active?: string,
  ) {
    return this.products.list(parsePage(page, pageSize), { q: q?.trim() || undefined, categoryId, active });
  }

  @Get('products/:id')
  @RequirePermissions('products:view')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.products.get(id);
  }

  @Post('products')
  @RequirePermissions('products:create')
  create(@Body() dto: CreateProductDto, @CurrentUser() u: AuthUser) {
    return this.products.create(dto, u.id);
  }

  @Patch('products/:id')
  @RequirePermissions('products:update')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductDto, @CurrentUser() u: AuthUser) {
    return this.products.update(id, dto, u.id);
  }

  @Get('products/:id/customer-prices')
  @RequirePermissions('products:view')
  customerPrices(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.listCustomerPrices(id);
  }

  /** Special price for one customer; changing prices is a sensitive permission. */
  @Put('products/:id/customer-prices')
  @RequirePermissions('products:update', 'sales:edit_price')
  setCustomerPrice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetCustomerPriceDto,
    @CurrentUser() u: AuthUser,
  ) {
    return this.catalog.setCustomerPrice(id, dto, u.id);
  }
}
