/**
 * Dynamic Expo config layered on app.json.
 * Production builds (EAS profile "production") are HTTPS-only: Android cleartext traffic is disabled and the app
 * refuses http:// server addresses. Development and preview builds keep plain HTTP so a LAN server still works.
 */
module.exports = ({ config }) => {
  const production = process.env.EAS_BUILD_PROFILE === 'production';
  const plugins = (config.plugins ?? []).map((p) =>
    Array.isArray(p) && p[0] === 'expo-build-properties'
      ? [p[0], { ...p[1], android: { ...p[1].android, usesCleartextTraffic: !production } }]
      : p,
  );
  return { ...config, plugins, extra: { ...config.extra, allowHttp: !production } };
};
