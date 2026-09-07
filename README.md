# Grapa · Taller de PDF

**Une, ordena, divide, folia y firma tus PDF sin que ningún documento salga de tu computadora.**

👉 **Usarla ahora: https://renzomoran9.github.io/GRAPA/**

Grapa nació para el trabajo diario con un sistema de gestión documental:
escaneas un documento, te llegan anexos sueltos (la indagación de mercado,
cotizaciones, informes) y tienes que armar un solo expediente ordenado,
foliado y con tu firma y sello donde corresponde. Todo eso se hace aquí, en
una sola pantalla.

---

## Tres formas de usarla

**1. Desde el navegador.** Abre https://renzomoran9.github.io/GRAPA/ — siempre
la última versión, sin instalar nada.

**2. Un solo archivo, sin internet.** Descarga [`Grapa.html`](Grapa.html)
(botón *Download raw file*) y dale doble clic. Lleva todo dentro: funciona sin
conexión y se puede repartir por USB, correo o una carpeta compartida.

**3. Con servidor local**, si prefieres servirla en la red interna:

```bash
node servidor.mjs      # http://localhost:4180
```

Funciona en Chrome, Edge y Firefox actuales.

---

## Lo que hace

### Armar el expediente
- Abre varios PDF a la vez, arrastrándolos o con **Abrir archivos**.
- También acepta **fotos y escaneos JPG / PNG**: los convierte en páginas A4.
- Y acepta **Word y Excel** (`.docx`, `.xlsx`, `.xls`, `.csv`): los convierte a PDF
  en el momento, dentro del navegador, sin subirlos a ningún sitio. Puedes soltarlos
  o pegarlos con **Ctrl+V**. La composición la rehace el navegador con las fuentes
  que tengas instaladas, así que se parece mucho pero puede no ser idéntica a lo que
  imprime Office: si algo debe salir exacto, guárdalo como PDF desde Word o Excel.
  Los `.xls` antiguos sí se leen; los `.doc` de Word 97 y los PowerPoint no, así que
  esos hay que abrirlos en Office y guardarlos como PDF.
- Cada archivo recibe un **color**, así sabes de un vistazo de dónde viene cada página.
- **Arrastra las miniaturas** para cambiar el orden. Si sueltas un PDF nuevo
  encima de una página concreta, se inserta justo ahí.
- Gira, duplica, elimina, manda al inicio o al final.
- Selección múltiple con `Ctrl` y `Shift`, y **deshacer / rehacer**.

### Firmar y sellar
1. Escanea tu firma y sello sobre una hoja y abre ese PDF en Grapa.
2. **Firmas y sellos → Desde escaneo**: encierra la firma en un recuadro y
   Grapa **le quita el fondo**, dejándola transparente y recortada.
3. Guárdala con un nombre. Queda en **ese navegador**: no se sube a ningún lado.
4. Para usarla, el botón **✍** de cualquier página: la arrastras al sitio
   exacto, la agrandas desde la esquina y la aplicas a esa página, a las
   seleccionadas, a todas o solo a la última.

Grapa **estima el tono del papel zona por zona**, así que funciona igual con una
hoja blanca escaneada que con una foto del sello tomada con el celular, con
papel gris y sombras. Dos controles separados afinan el resultado: *limpieza del
fondo* borra más papel, *intensidad del trazo* rescata las líneas finas; mover
uno no deshace el otro.

También puedes crear firmas desde una imagen ya recortada o dibujándolas a mano.

### Foliar
Por defecto numera **de abajo hacia arriba**, como en papel: la última hoja
lleva el folio 1 y se cuenta hacia arriba, así los documentos que se adjuntan
encima toman los números altos y **lo ya foliado no cambia**. También está el
sentido corriente.

Formatos listos (`1`, `Folio 1`, `Folio N° 1`, `1 de 10`, `Pág. 1 / 10`) o texto
libre con `{n}` y `{t}`. Los folios se recalculan al reordenar y se mantienen al
dividir el expediente.

### Revisar hoja por hoja
**Ver en grande** (tecla `V`) abre el expediente a pantalla completa: las hojas
una debajo de otra, con sus firmas y folios ya puestos. Desde ahí puedes girar,
firmar o eliminar la hoja que estás mirando.

### Guardar el trabajo a medio hacer
Grapa **autoguarda** lo que estás armando: si cierras el navegador por error, al
volver te ofrece continuar. Y puedes guardar expedientes con nombre para
retomarlos otro día. Todo se queda en tu equipo.

### Carpeta de destino
Si eliges una carpeta, el PDF terminado se escribe ahí directamente, sin pasar
por Descargas, y al dividir se escriben todos los archivos de una. Si ya existe
un archivo con ese nombre, Grapa añade `(2)` en vez de pisarlo.
Requiere Chrome o Edge.

### Dividir
Con las **tijeras ✂** entre páginas, por selección, por rangos (`1-3, 5, 8-10`)
o un archivo por página.

---



## Paquetes

Lo que entra de una vez es un **paquete**. Si una empresa manda su cotización en
tres archivos y los cargas juntos, esos tres son un solo paquete: en el taller
se ve **una tarjeta** con la portada, el nombre y cuántas hojas trae, no quince
hojas sueltas.

- **Ver** entra en el paquete: ahí sí salen sus hojas y se giran, reordenan,
  firman o borran como siempre. **◀ Paquetes** vuelve.
- El nombre sale del archivo, pero se cambia con doble clic o con **✎**: ponle
  el nombre de la empresa y lo reconoces de un vistazo.
- **＋** carga más archivos dentro de un paquete que ya existe.
- **Arrastrar** una tarjeta mueve la cotización entera con todas sus hojas.
- Con un solo documento no cambia nada: se ven las hojas como siempre. La vista
  de paquetes se enciende sola al llegar el segundo, y **☰ Ver todas las hojas**
  las muestra todas juntas cuando hace falta.

- **El tacho**: al arrastrar una hoja o un paquete asoma abajo a la derecha. Lo
  que le sueltes se quita, y el aviso recuerda que **Ctrl+Z** lo devuelve —con
  su nombre incluido, si era un paquete.

Es solo una forma de ver y trabajar: la foliación y el PDF final salen igual.

## Atajos

| Atajo | Qué hace |
|---|---|
| `Ctrl+O` | Abrir archivos |
| `Ctrl+S` | Guardar PDF |
| `Ctrl+Z` / `Ctrl+Y` | Deshacer / Rehacer |
| `Ctrl+A` | Seleccionar todas las páginas |
| `Ctrl+D` | Duplicar |
| `Supr` | Eliminar |
| `V` | Ver las hojas en grande |
| `[` / `]` | Girar a la izquierda / derecha |
| `Clic + Shift` | Seleccionar un rango |
| `Clic + Ctrl` | Añadir o quitar de la selección |

---

## Privacidad

Grapa **no tiene servidor**. Los PDF se leen y se rearman dentro del navegador,
con `pdf.js` para dibujar las páginas y `pdf-lib` para escribir el archivo
final. Nada se sube, nada se guarda fuera de tu equipo y funciona sin conexión.

Tus firmas y expedientes guardados viven en el almacenamiento de **ese navegador
y ese perfil de usuario**. Ojo con esto: si dos personas usan la misma
computadora con el mismo usuario de Windows, comparten navegador y por tanto
verían las firmas de la otra. Que cada quien use su propio usuario.

---

## Cómo está hecho

```
index.html            estructura de la interfaz
assets/
  styles.css          tema claro y oscuro
  core.js             estado, lectura de PDF, miniaturas, geometría y armado final
  expedientes.js      guardado del trabajo (IndexedDB) y carpeta de salida
  firmas.js           limpieza de fondo, recorte desde escaneo, dibujo
  app.js              interfaz: rejilla de páginas, arrastre, foliación, lector, dividir
lib/                  pdf-lib, pdf.js y JSZip incluidos (ver lib/LICENCIAS.md)
construir.mjs         arma Grapa.html, el archivo único
servidor.mjs          servidor estático opcional, sin dependencias
```

Sin build, sin `npm install`, sin framework: archivos estáticos. Para regenerar
el archivo único después de tocar el código:

```bash
node construir.mjs
```

### Nota técnica sobre `file://`

Los navegadores no dejan crear *Web Workers* desde `file://`. Cuando Grapa
detecta ese caso, carga `pdf.worker.min.js` como script normal y pdf.js trabaja
en el hilo principal: por eso funciona con doble clic. Servida por web usa el
worker de verdad y va más rápido con documentos largos.

---

## Ideas para más adelante

- Reconocer texto (OCR) en escaneos para poder buscar dentro del expediente.
- Índice o carátula automática con la lista de documentos y sus folios.
- Comprimir el PDF final bajando la resolución de las imágenes escaneadas.
