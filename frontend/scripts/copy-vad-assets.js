const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const publicDir = path.join(root, "public");

const files = [
  {
    src: "node_modules/@ricky0123/vad-web/dist/vad.worklet.bundle.min.js",
    dest: "public/vad/vad.worklet.bundle.min.js",
  },
  {
    src: "node_modules/@ricky0123/vad-web/dist/silero_vad_v5.onnx",
    dest: "public/vad/silero_vad_v5.onnx",
  },
  {
    src: "node_modules/@ricky0123/vad-web/dist/silero_vad_legacy.onnx",
    dest: "public/vad/silero_vad_legacy.onnx",
  },
];

for (const { src, dest } of files) {
  const srcPath = path.join(root, src);
  const destPath = path.join(root, dest);
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
    console.log("copied", dest);
  } else {
    console.error("missing", srcPath);
    process.exit(1);
  }
}

const ortSourceDir = path.join(root, "node_modules/onnxruntime-web/dist");
const ortDestDir = path.join(root, "public/ort-wasm");
const ortFiles = fs
  .readdirSync(ortSourceDir)
  .filter((f) => f.endsWith(".wasm") || f.endsWith(".mjs"));
for (const f of ortFiles) {
  fs.copyFileSync(path.join(ortSourceDir, f), path.join(ortDestDir, f));
  console.log("copied ort-wasm", f);
}

const ortBundle = "ort.min.js";
fs.copyFileSync(
  path.join(ortSourceDir, ortBundle),
  path.join(ortDestDir, ortBundle)
);
console.log("copied ort bundle", ortBundle);
