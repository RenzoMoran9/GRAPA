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

### Buscar dentro del expediente
**Buscar** en el panel (o `Ctrl+F`) encuentra una palabra en todas las hojas:
un RUC, el nombre de un postor, un monto, un número de expediente. Dice
cuántas veces aparece y en qué hojas, la resalta en amarillo **encima de la
palabra misma** —en la miniatura y en **Ver en grande**— y apaga un poco las
hojas donde no está, para que las otras salten a la vista.

- Da igual cómo se escriba: sin tildes, en minúsculas, sin los signos.
  `razon social distribuidora` encuentra «Razón social: Distribuidora», y
  `1250` encuentra «S/ 1,250.00».
- `Enter` salta a la siguiente y `Shift+Enter` a la anterior; la lista del
  panel enseña cada una con su trozo de frase, y la lupa de la fila la abre
  en grande. En **Ver en grande** también se salta de una a otra.
- **Marcar estas hojas** deja marcadas justo las hojas donde aparece, para
  bajarlas, moverlas o sacarlas a un PDF aparte.
- El texto de cada hoja se lee una sola vez, la primera vez que buscas; un
  expediente de 90 hojas tarda menos de un segundo, y las búsquedas que
  siguen son al instante.

Solo se puede buscar en las hojas que **tienen texto**. Las escaneadas son
una foto del papel: Grapa dice cuáles son para que sepas dónde no ha podido
mirar.

### Hojas en blanco, de lado, de cabeza o torcidas
**Revisar** en el panel mira todas las hojas de una vez y dice cuáles son
los reversos en blanco que deja el escáner a doble cara y cuáles entraron
de lado, de cabeza o torcidas. Cada una sale en una lista y con una
etiqueta en su miniatura. **No cambia nada hasta que lo pides**:

- **Borrar N hojas** quita las que están en blanco; **Enderezar N hojas**
  gira las de lado y las de cabeza y endereza las torcidas. `Ctrl+Z` lo
  deshace, y la hoja vuelve a salir en la lista.
- Si alguna está bien, quítale la marca de la casilla y no se toca.
  **Marcarlas** las deja marcadas en el taller, para mirarlas o moverlas.
- Una hoja en blanco es la que no tiene nada escrito. No cuentan la letra
  del otro lado que se trasluce, la sombra o la raya del borde del escáner
  ni una mota; un «V° B°» con una rúbrica ya **no** es una hoja en blanco.
- La hoja torcida se endereza dentro del PDF que sale, girando lo que trae
  la hoja; los folios y las firmas que pongas van derechos, como siempre.
- Cada hoja escaneada tarda menos de medio segundo en revisarse; las que
  traen texto, casi nada.

Qué no hace todavía:

- En una hoja escaneada **toda en mayúsculas** no sabe si está de cabeza
  (se fija en las letras que sobresalen, como la «b» o la «p»), y en una
  escaneada que está acostada sin letra clara dice «de lado: gírala a mano».
  Antes de equivocarse, se calla.
- Una hoja con fotos, un plano o un cuadro sin renglones no la marca como
  torcida aunque lo esté, y no endereza más de 10 grados.
- Las hojas que traen texto de verdad dicen hacia dónde se leen, pero no se
  miran torcidas: un PDF hecho en la computadora no se tuerce.

### Bajarle el peso al PDF

En **Archivo de salida · Peso del archivo**, cuatro maneras:

| | Qué hace | Una cotización escaneada de 1,2 MB |
|---|---|---|
| **Original** | No toca nada | 1216 KB |
| **Ligero** | Redibuja a 150 ppp solo las hojas escaneadas | 131 KB |
| **Mínimo** | Baja a 100 ppp **todas** las hojas, en color | 65 KB |
| **Blanco y negro** | Las escaneadas a un bit, a 200 ppp | **30 KB** |

**Blanco y negro** es el más chico y, a la vez, el que menos pierde:

- Pesa **la mitad que «Mínimo» y va al doble de resolución**, así que se lee
  mejor, no peor. Una hoja de papel escrito es casi todo blanco con unas pocas
  letras negras: guardarla a un bit —cada píxel es tinta o papel— y comprimirla
  sin pérdida es lo que hace cualquier escáner en modo «documento».
- Las hojas que llevan **texto de verdad no se tocan**, así que conservan su
  texto. «Mínimo» las rasteriza y lo pierde.
- Lo que se pierde es el **color**. Y si una hoja es una **fotografía** de
  verdad —no un papel escaneado— se guarda a color igual, porque a un bit se
  destrozaría.

Para decidir qué es tinta no vale un umbral único: los escaneos traen sombras y
una cabecera de color saldría entera negra. El papel se mide **por zonas**, y se
exige **contraste**: en una zona lisa no hay letra por mucho que sea más oscura
que el papel.

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


## Sacar una hoja o subirla a otra web

- Marcar hojas es cosa de **la casilla** de cada una, y de nada más: así no se
  desmarca nada sin querer. `Shift`+clic en la casilla marca un rango entero.
- **Doble clic en la hoja** la abre en grande.
- Dentro de un paquete, mover al principio, al final o a una posición es
  **dentro de ese paquete**. Con todas las hojas a la vista, del expediente.
- **⤓ Bajar selección** junta las hojas marcadas en un solo PDF, a **Descargas**.
- La **⤓** de cada hoja la descarga sola, en su propio PDF. Va siempre a
  **Descargas**, aunque tengas una carpeta vinculada: la carpeta es para el
  expediente terminado, no para una hoja que se saca de paso.
- **↗ Subir a…** guarda lo que tengas (o la selección, o el paquete abierto)
  como «… - para editar.pdf» en Descargas y abre en otra pestaña el editor que
  configures en *Archivo de salida*. Viene puesto PDF Guru, pero se cambia por
  el que quieras y el botón se renombra solo.

  Un enlace no puede entregarle el archivo a otra web: por eso Grapa lo guarda y
  abre la pestaña, y tú lo arrastras ahí. Y ten presente que **lo que subas a un
  editor en línea sale de tu computadora**; eso ya depende de esa web.

## Corregir el texto de un PDF

Grapa arma el expediente; para **corregir una palabra dentro de un PDF** está
**Grapa Editor**, un programa aparte:
<https://github.com/RenzoMoran9/HERRAMIENTA-PDF>

Descarga su `GrapaEditor.html` y guárdalo **en la misma carpeta que
`Grapa.html`**. Con Grapa abierta desde la web, si el editor no está al lado se
usa el publicado.

**Para corregir una hoja suelta** —que es lo normal— usa la **T** de esa hoja,
o ábrela en grande y pulsa la **T** de la barra del lector. El botón **T Editar
texto** de arriba manda las hojas marcadas, o el expediente entero si no hay
ninguna marcada.

Al terminar, **Devolver a Grapa** trae lo corregido **a su sitio**: cada hoja
sustituye a la suya, en la misma posición y el mismo paquete, y **recupera sus
folios y firmas**. Si vuelven más o menos hojas de las que se mandaron, entra
como documento aparte y no se toca el expediente.

Lo que viaja al editor va **sin comprimir y sin sellos**. Comprimir volvería la
hoja una foto —con «Mínimo», también las de texto— y entonces no habría ni una
letra que corregir; y los folios y firmas los vuelve a poner Grapa al guardar,
así que si viajaran pegados saldrían por duplicado.

**El documento viaja de una pestaña a otra en memoria**: no se guarda en disco,
no pasa por ninguna red y no hace falta internet. Si el editor no está al lado,
Grapa lo dice y no pasa nada más.

No corrige texto de escaneos: ahí no hay letras, hay una foto.

> **Por qué son dos programas y no uno.** Grapa Editor usa MuPDF, que es libre
> pero con licencia AGPL: todo programa que lo lleve *dentro* queda sujeto a esa
> licencia. Grapa no lo lleva dentro, solo lo abre en otra pestaña, así que
> sigue siendo un programa independiente. Por eso el editor vive en su propio
> repositorio.

## Capturas

En el lector, el botón **⬚ Capturar** deja marcar con el ratón cualquier trozo
de la hoja y llevárselo como imagen: **Copiar** para pegarlo con `Ctrl+V` donde
quieras —un correo, un Word, un chat— o **Descargar** para tenerlo como PNG.

No es el recorte de firmas: eso sigue en **Firmas**, y sirve para otra cosa.

El trozo no se saca de lo que hay en pantalla, que está al tamaño de la
ventana y saldría borroso al pegarlo, sino de un dibujo nuevo a alta
resolución. Marcando un renglón de una A4 salen del orden de 1500 píxeles de
ancho. Y lleva pintados los folios y las firmas que tenga la hoja, para que
salga tal como se ve.

`Esc` cancela.

## Atajos

| Atajo | Qué hace |
|---|---|
| `P` | Plegar o desplegar el panel lateral |
| `Ctrl+O` | Abrir archivos |
| `Ctrl+S` | Guardar PDF |
| `Ctrl+F` | Buscar una palabra en todas las hojas · `Enter` pasa a la siguiente |
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
  buscar.js           el texto de cada hoja: qué palabra está dónde
  revisar.js          hojas en blanco, de lado, de cabeza o torcidas
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

- Reconocer texto (OCR) en escaneos, para poder buscar también en ellos.
- Índice o carátula automática con la lista de documentos y sus folios.
