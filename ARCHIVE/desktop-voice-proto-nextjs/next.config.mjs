/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.externals = config.externals || [];
      config.externals.push(
        { "onnxruntime-web": "ort" },
        { "onnxruntime-web/wasm": "ort" }
      );
    }
    return config;
  },
};

export default nextConfig;
