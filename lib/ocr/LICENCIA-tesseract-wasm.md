BSD 2-Clause License

Copyright (c) 2022, Robert Knight and tesseract-wasm contributors

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

---
Nota de Pdflash: `tesseract-worker.js` es el original de tesseract-wasm 0.11.0
con un único cambio: la dirección de `tesseract-core.wasm` se resuelve contra
una base fija, porque el motor se arranca desde un Blob (así funciona también
dentro de Grapa.html) y un Blob no sirve de base para una dirección relativa.
El archivo .wasm se entrega ya cargado y nunca se pide por esa dirección.

Contenido: tesseract-wasm (BSD-2-Clause) que empaqueta Tesseract OCR y
Leptonica (Apache-2.0 / BSD-2). `spa.traineddata` es el modelo «fast» de
https://github.com/tesseract-ocr/tessdata_fast (Apache-2.0).
