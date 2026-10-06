# Librerías incluidas

Grapa funciona sin conexión porque trae sus dependencias dentro de `lib/`.

| Archivo | Proyecto | Versión | Licencia |
|---|---|---|---|
| `pdf-lib.min.js` | [pdf-lib](https://github.com/Hopding/pdf-lib) | 1.17.1 | MIT |
| `pdf.min.js`, `pdf.worker.min.js` | [PDF.js](https://github.com/mozilla/pdf.js) (Mozilla) | 3.11.174 | Apache-2.0 |
| `jszip.min.js` | [JSZip](https://github.com/Stuk/jszip) | 3.10.1 | MIT / GPLv3 |
| `docx-preview.min.js` | [docx-preview](https://github.com/VolodymyrBaydalka/docxjs) | 0.4.0 | Apache-2.0 |
| `xlsx.core.min.js` | [SheetJS](https://github.com/SheetJS/sheetjs) | 0.18.5 | Apache-2.0 |
| `html2canvas.min.js` | [html2canvas](https://github.com/niklasvh/html2canvas) | 1.4.1 | MIT |
| `../assets/inter-latin.woff2` (tipografía) | [Inter](https://rsms.me/inter/) (Rasmus Andersson) | 4.0 | SIL Open Font License 1.1 |
| `ocr/tesseract-wasm.js`, `ocr/tesseract-worker.js`, `ocr/tesseract-core.wasm` | [tesseract-wasm](https://github.com/robertknight/tesseract-wasm) (con Tesseract OCR y Leptonica) | 0.11.0 | BSD-2-Clause (Tesseract y Leptonica: Apache-2.0 / BSD-2) |
| `ocr/spa.traineddata` | modelo de español «fast» de [tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast) | — | Apache-2.0 |
| `ocr/ort.wasm.bundle.min.mjs`, `ocr/ort-wasm-simd-threaded.wasm` | [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) (Microsoft) | 1.23.0 | MIT |
| `ocr/paddle-det.onnx`, `ocr/paddle-rec.onnx`, `ocr/paddle-dic.txt` | modelos PP-OCRv6 *tiny* de [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) (detección y reconocimiento, con su diccionario), en formato ONNX tal como los publica [ppu-paddle-ocr-models](https://github.com/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr-models) | v6 tiny | Apache-2.0 |
| `ocr/paddle-worker.js` | propio: el lector PaddleOCR que corre en un Worker | — | — |

Las piezas de `ocr/` solo se cargan cuando hay que leer un escaneo (ubicar formatos, copiar su texto o evaluar ofertas). El lector principal es PaddleOCR; Tesseract queda de respaldo para los navegadores donde aquel no arranca. Ver `ocr/LICENCIA-tesseract-wasm.md` para el único cambio hecho al motor de Tesseract.
