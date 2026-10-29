# Local person segmentation runtime

The files in this folder ship with the app; cutout does not upload frames or download a model at runtime.

- Runtime: @mediapipe/tasks-vision 1.1.1, Apache-2.0. WASM/JS copied from its npm package.
- Person model: Google MediaPipe Selfie Segmenter float16, https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite
- Model SHA256: 191ac9529ae506ee0beefa6b2c945a172dab9d07d1e802a290a4e4038226658b
- Upstream: https://github.com/google-ai-edge/mediapipe
- See LICENSE in this folder. Preserve notices when redistributing.

After npm ci, keep these model files. When deliberately upgrading tasks-vision, copy its matching wasm files into this directory and repeat the Electron cutout integration test.
