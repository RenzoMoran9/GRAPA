# Pdflash · Taller de PDF

**Une, ordena, divide, folia y firma tus PDF sin que ningún documento salga de tu computadora.**

👉 **Usarla ahora: https://renzomoran9.github.io/GRAPA/**

Pdflash nació para el trabajo diario con un sistema de gestión documental:
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

### Primeros pasos
- **La pantalla de inicio dice qué hacer** en tres pasos (abrir, ordenar,
  foliar y firmar, exportar), con **Abrir archivos** y **Probar con un
  ejemplo**.
- **Recorrido guiado:** la primera vez, un recorrido de un minuto señala
  dónde está cada cosa. Vuelve desde *Ayuda ▸ Recorrido guiado*.
- **Expediente de ejemplo:** seis hojas de práctica (requerimiento,
  especificaciones, dos cotizaciones, Formatos 1 y 5) para probar sin
  arriesgar tus documentos. También desde *Ayuda ▸ Abrir un expediente de
  ejemplo*.
- **Una herramienta a la vez:** el riel de la izquierda elige la herramienta
  y el panel enseña solo esa, con una línea que dice para qué sirve.
- La barra de arriba lleva lo de siempre (Abrir, Imprimir, Guardar, Exportar
  PDF); *Editar texto* está en *Archivo* y en «Ver en grande», y el tema
  claro/oscuro en *Ver*.

### Armar el expediente
- Abre varios PDF a la vez, arrastrándolos o con **Abrir archivos**.
- También acepta **fotos y escaneos JPG / PNG**: los convierte en páginas A4.
- Y acepta **Word y Excel** (`.docx`, `.xlsx`, `.xls`, `.csv`): los convierte a PDF
  en el momento, dentro del navegador, sin subirlos a ningún sitio. Puedes soltarlos
  o pegarlos con **Ctrl+V**. La composición la rehace el navegador con las fuentes
  que tengas instaladas, así que se parece mucho pero puede no ser idéntica a lo que
  imprime Office: si algo debe salir exacto, guárdalo como PDF desde Word o Excel.
  - **Word:** el documento se reparte en hojas del tamaño de su papel (antes uno
    de tres hojas salía como una sola hoja larga), con su encabezado y pie en
    cada una; las tablas y listas largas se parten entre hojas, los cuadros de
    texto del membrete (el pie con dirección y web) se ven, y si falta una fuente
    se usa la más parecida en vez de una con serifa. Las notas al pie van al final.
  - **Excel (`.xlsx`):** sale como lo imprime Excel: área de impresión,
    orientación, márgenes, «ajustar a una página», anchos y altos, celdas
    combinadas, rellenos, bordes, fuentes, formatos de número, logos y filas de
    título repetidas. Los `.xls` antiguos y los `.csv` se leen sin formato.
  Los `.xls` antiguos sí se leen; los `.doc` de Word 97 y los PowerPoint no, así que
  esos hay que abrirlos en Office y guardarlos como PDF.
- Cada archivo recibe un **color**, así sabes de un vistazo de dónde viene cada página.
- **Arrastra las miniaturas** para cambiar el orden. Si sueltas un PDF nuevo
  encima de una página concreta, se inserta justo ahí.
- Gira, duplica, elimina, manda al inicio o al final.
- Selección múltiple con `Ctrl` y `Shift`, y **deshacer / rehacer**.

### Varios expedientes a la vez: tableros
Pdflash abre **hasta diez expedientes a la vez**, cada uno en su pestaña, para
avanzar con todos en paralelo.

- **Nuevo tablero** (el **＋** de las pestañas o *Archivo ▸ Nuevo tablero*) abre
  otro en blanco; si ya tienes uno en blanco, te lleva a ese. **Alt+1 … Alt+9**
  cambian de uno a otro, y **Alt+0** va al décimo.
- **Con muchas pestañas** se estrechan y la tira se desplaza (también con la
  rueda del ratón); la pestaña que ves siempre queda a la vista y un
  degradado avisa de que hay más a un lado.
- **Todos de un vistazo:** la **flecha** junto a las pestañas despliega una
  tarjeta por tablero, con la portada, cuántas hojas y documentos trae y si
  está **guardado, foliado y firmado**. Un clic en la tarjeta va a ese
  tablero; desde ahí también se guarda o se cierra cada uno, y «Guardar los N»
  guarda todo lo pendiente. No hace falta salir del tablero que estás viendo.
- **Cada tablero tiene lo suyo:** sus hojas, paquetes, selección, deshacer y
  rehacer, el expediente que se está editando, el nombre del archivo de salida
  y su propio autoguardado. Lo que haces en uno no toca a los otros.
- **Se comparte lo común:** la lista de expedientes guardados, las firmas y los
  sellos, la carpeta de salida y las preferencias.
- **Un expediente guardado solo puede estar abierto en un tablero.** Si lo
  abres otra vez, te lleva al tablero que ya lo tiene. Al abrir uno se usa
  primero un tablero en blanco; si los diez están en uso, pregunta antes de
  reemplazar el actual.
- **La pestaña dice cómo está:** un punto naranja significa *sin guardar*; sin
  punto, ya está guardado. El título, la barra de abajo y la lista de guardados
  lo muestran igual y en qué tablero está abierto cada expediente.
- **Guardar o actualizar en uno se ve en todos:** la lista de guardados se
  actualiza al instante, también en otras ventanas de Pdflash abiertas a la
  vez. Si otra ventana guardó el mismo expediente que tienes abierto, Pdflash
  avisa y pide confirmar antes de pisarlo.
- **Enviar hojas a otro tablero:** con hojas marcadas, **Enviar a…** las
  *copia* o las *mueve*. Llegan encima, en un paquete aparte, con sus firmas y
  sellos; los folios no viajan, porque se numeraban en el expediente de origen.
  Allí Ctrl+Z las quita.
- **Cerrar un tablero** (la **×**, o clic con el botón central) con cambios sin
  guardar ofrece **Guardar y cerrar**, *Cerrar sin guardar* o *Cancelar*. Con
  los diez tableros en uso, *Nuevo* pasa a *Vaciar este tablero*.

### Que no se pierda nada sin guardar
- **«N sin guardar»**, arriba a la derecha de las pestañas, dice cuántos
  expedientes tienen trabajo sin guardar, aunque su pestaña no esté a la vista.
  Al pulsarlo salen todos: **Ir** a cada uno, **Guardar** uno, o **Guardar los
  N** de una vez (a los nuevos les pide un nombre).
- **Cerrar, vaciar o reemplazar** un tablero sin guardar ofrece **Guardar y …**
  antes de seguir. Ya no dice «queda guardado» si lo último no se guardó.
- **Si llevas 10 minutos** con un expediente sin guardar, te lo recuerda una
  vez, con un botón para guardarlo.
- La **pestaña del navegador** lleva un **●** delante del nombre mientras algo
  esté sin guardar, y al **cerrar la ventana** el navegador pregunta solo si
  queda algo sin guardar (con todo guardado ya no molesta).
- Al **continuar donde lo dejaste**, un expediente que no cambió desde que lo
  guardaste vuelve como *Guardado*, no como *Sin guardar*.
- Lo que corrige el **editor avanzado** vuelve al tablero que mandó las hojas,
  aunque mientras tanto hayas cambiado de tablero.

### Muchos expedientes abiertos: la memoria
Los PDF de todos los tableros están a la vez en la memoria del navegador. Con
varios expedientes escaneados grandes, el navegador puede ir lento o incluso
cerrar la pestaña. Por eso Pdflash vigila cuánto ocupa lo abierto:

- A partir de unos **350 MB** de PDF abiertos avisa una vez, y abajo, en la
  barra de estado, aparece cuánto ocupan; desde **700 MB** el aviso es más
  fuerte. El aviso dice cuántos tableros ya están guardados y te propone
  cerrarlos: se vuelven a abrir desde **Exped.** cuando hagan falta.
- En la lista de tableros (la flecha) cada tarjeta dice lo que pesan sus PDF.
- Cerrar un tablero suelta de la memoria los PDF que ya no usa ningún otro.

### La ruta del expediente
Bajo el título, una tira con los pasos de siempre: **Documentos · Revisado ·
Foliado · Firmado · Guardado · Exportado**. Lo hecho sale en verde, lo que pide
atención en ámbar (por ejemplo, «2 hojas no tienen folio» o «cambios sin
guardar») y el paso siguiente, en naranja.

- El botón de la derecha hace el paso siguiente: **Foliar →**, **Firmar →**,
  **Guardar →**, **Exportar PDF →**. Cuando no falta nada dice *Todo listo*.
- Pulsar un paso abre su herramienta en el panel.
- *Revisado* es opcional: solo se propone si encontró hojas en blanco o
  torcidas sin corregir.
- *Exportado* sabe si el PDF que sacaste sigue al día o si cambiaste algo
  después.
- La **×** la oculta; vuelve desde *Ver ▸ Mostrar la ruta del expediente*.

### Antes de exportar
**Exportar PDF** mira primero lo que suele olvidarse: si no está foliado (o
hay hojas sin folio), si no lleva ninguna firma, o si quedan hojas en blanco
o torcidas sin corregir. Si falta algo, lo dice y deja elegir entre
**Exportar igual** y **Corregir primero**, que te lleva a esa herramienta.
«No numerar la primera página» no cuenta como falta. Se apaga en *Archivo de
salida*.

Al terminar, si el expediente no está guardado en Pdflash, lo recuerda con un
botón **Guardar expediente**: el PDF exportado no sirve para retomar el trabajo
otro día.

### Firmar y sellar
1. Escanea tu firma y sello sobre una hoja y abre ese PDF en Pdflash.
2. **Firmas y sellos → Desde escaneo**: encierra la firma en un recuadro y
   Pdflash **le quita el fondo**, dejándola transparente y recortada.
3. Guárdala con un nombre. Queda en **ese navegador**: no se sube a ningún lado.
4. Para usarla, el botón **✍** de cualquier página: la arrastras al sitio
   exacto, la agrandas desde la esquina y la aplicas a esa página, a las
   seleccionadas, a todas o solo a la última.

Pdflash **estima el tono del papel zona por zona**, así que funciona igual con una
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
**Ver en grande** (tecla `V`) abre el expediente en grande en el sitio de las
hojas: una debajo de otra, con sus firmas y folios ya puestos. Desde ahí puedes
girar, firmar o eliminar la hoja que estás mirando.

El panel, el riel y los botones de arriba siguen a mano: puedes foliar,
sellar, buscar o guardar sin cerrar las hojas en grande, y lo que hagas se ve
en ellas al momento. La hoja que pulsas queda seleccionada, así que lo que
hagas desde el panel va a esa hoja.

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

### Hacer buscables las hojas escaneadas
Las hojas escaneadas son una foto del papel: por dentro no tienen letras, y
el buscador no puede mirar ahí. Al abrir **Buscar**, Pdflash dice cuántas son y
ofrece **Hacer buscables las N hojas**:

1. Pdflash las lee ahí mismo, con su propio lector de escaneos, varias a la
   vez y con su avance («3 de 12»). Tarda unos segundos por hoja y mientras
   tanto se puede seguir trabajando; **Detener** para y deja buscables las
   que ya leyó.
2. Cada hoja sigue en su sitio, con sus folios, firmas y giro, y **se ve
   igual**: lo leído va como texto invisible encima de la foto, palabra por
   palabra, también si la hoja estaba de lado, de cabeza o torcida.
3. Desde ahí el buscador las encuentra y resalta la palabra en su lugar, y el
   PDF que guardes también se puede buscar y copiar en cualquier otro programa.

Las hojas que ya tienen texto no se tocan, y las que son una foto o un plano
sin letras se dejan como están y no se vuelven a ofrecer. Todo pasa en tu
computadora y **ya no hace falta el editor ni otra pestaña**: funciona igual
en la web y con `Grapa.html` sin internet. `Ctrl+Z` lo deshace. El
reconocimiento puede equivocarse en alguna letra, sobre todo en escaneos
borrosos: lo que no lea bien, no se encontrará.

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
- Las hojas se revisan varias a la vez, cada una dibujada en su propio hilo:
  un expediente escaneado de 35 hojas tarda unos 15 segundos; las que traen
  texto, casi nada.

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
| **Ligero** | Redibuja a 150 ppp las hojas escaneadas; en las de texto, achica las fotos | 131 KB |
| **Mínimo** | Baja a 100 ppp **todo**, en color | 65 KB |
| **Blanco y negro** | Las escaneadas a un bit, a 200 ppp | **30 KB** |

**Blanco y negro** es el más chico y, a la vez, el que menos pierde:

- Pesa **la mitad que «Mínimo» y va al doble de resolución**, así que se lee
  mejor, no peor. Una hoja de papel escrito es casi todo blanco con unas pocas
  letras negras: guardarla a un bit —cada píxel es tinta o papel— y comprimirla
  sin pérdida es lo que hace cualquier escáner en modo «documento».
- Las hojas que llevan **texto de verdad** conservan su texto: solo se
  achican sus imágenes. «Mínimo» vuelve foto las que no tienen imágenes y
  les quita el texto.
- Lo que se pierde es el **color**. Y si una hoja es una **fotografía** de
  verdad —no un papel escaneado— se guarda a color igual, porque a un bit se
  destrozaría.

**Hojas con texto de verdad** (correos impresos, fichas técnicas, cartas,
escaneos con texto buscable): no se vuelven foto, para no perder el texto.
Como hacen los compresores de PDF, se entra en **cada imagen** de la hoja
—la foto de la ficha, el logo, el escaneo que va debajo del texto— y se
guarda a la resolución a la que de verdad se ve (150 ppp en Ligero, 100 en
Mínimo; en Blanco y negro, el papel escrito a un bit y las fotos a 150).
Una foto de 1600 puntos dibujada en 15 cm pasa a 886 y pesa la cuarta parte.
Además, lo que viene **repetido** de varios archivos (las mismas letras, el
mismo logo) se guarda una sola vez. Todo en la computadora: el documento no
se sube a ningún servidor, como sí hacen PDF24 o iLovePDF.

Para decidir qué es tinta no vale un umbral único: los escaneos traen sombras y
una cabecera de color saldría entera negra. El papel se mide **por zonas**, y se
exige **contraste**: en una zona lisa no hay letra por mucho que sea más oscura
que el papel.

### Peso máximo: «que no pase de 10 MB»

Si donde subes el PDF hay un límite —el sistema de gestión documental, un correo—, escríbelo en **Peso
máximo** y pulsa **¿Cabe? Calcular el peso**. Pdflash arma el PDF **de verdad**
con cada ajuste, del que menos pierde al que más (Original → Ligero → Blanco y
negro → Mínimo), y para en el primero que cabe: no es una estimación, es lo que
va a pesar. Te dice cuál cabe y el botón **Usar** lo deja elegido.

- Al **guardar**, si el ajuste elegido no cabe, lo dice **antes**: «Con
  Original pesa 2,3 MB. Con Blanco y negro queda en 137 KB y sí cabe». Si
  aceptas, guarda ese, que ya está armado; si cancelas, no guarda nada.
- Si no cabe ni con el más chico, lo dice y propone dividirlo en partes.
- Si cambias hojas después de calcular, pide volver a calcular.
- El MB es el de Windows (1 MB = 1024 × 1024 bytes). El máximo se recuerda.
- Calcular arma el PDF hasta cuatro veces: en un expediente escaneado largo
  tarda lo mismo que guardarlo esas veces.
- Por ahora vale para **Exportar PDF**. Al **dividir**, cada parte no se
  compara con el máximo.

### Guardar el trabajo a medio hacer
Pdflash **autoguarda** lo que estás armando, **un autoguardado por tablero y por
ventana**: si cierras el navegador por error, al volver te ofrece continuar con
**todos** los tableros que tenías. Con **dos ventanas de Pdflash abiertas a la
vez**, cada una guarda lo suyo (antes la última pisaba a la otra) y al
recargar una solo se ofrece lo de las ventanas que ya se cerraron. Si se
borran todas las hojas de un tablero, su autoguardado también se borra. Y puedes guardar expedientes con nombre para retomarlos
otro día con **Guardar** (o **Ctrl+Mayús+S**): la primera vez pide un nombre y
después actualiza el mismo guardado. **Exportar PDF** (**Ctrl+S**) arma el PDF
terminado. Todo se queda en tu equipo.

### Imprimir
Cada hoja y cada paquete traen su botón de **imprimir** (la impresora), y
también lo hay en «Ver en grande» y en la barra de las hojas marcadas.
**Imprimir** (o **Ctrl+P**) saca las hojas marcadas o, si no hay ninguna, todas
las que estás viendo. Salen como al exportar, con sus folios, firmas y sellos,
y sin comprimir. Se abre el cuadro de impresión del navegador, donde eliges la
impresora, las copias y si va a doble cara. Abriendo `Grapa.html` desde el
disco, el navegador no deja imprimir desde dentro de la página: el PDF se abre
en otra pestaña y ahí se imprime con Ctrl+P.

### Carpeta de destino
Si eliges una carpeta, el PDF terminado se escribe ahí directamente, sin pasar
por Descargas, y al dividir se escriben todos los archivos de una. Si ya existe
un archivo con ese nombre, Pdflash añade `(2)` en vez de pisarlo.
Requiere Chrome o Edge.

### Separar en otro PDF
La herramienta **Separar** saca hojas a un PDF aparte; el expediente no cambia.
Se elige qué sacar y, antes de descargar, dice en palabras qué va a salir
(«Saldrán 3 PDF: hojas 1–2 · hojas 3–4 · hojas 5–6»):

- **Solo las hojas que marque:** las marcadas con su casilla, juntas en un PDF.
- **Partir en varios PDF:** con las **tijeras ✂** entre hojas. Al elegir esta
  opción se ven siempre y más grandes; *Quitar todos los cortes* las limpia.
- **Por números de hoja:** `1-3, 5, 8-10` (cada grupo es un PDF). Si no se
  entiende lo escrito, lo dice.
- **Cada hoja en su PDF.**

Si sale más de un PDF, se descargan juntos en un ZIP.

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
  de paquetes se enciende sola al llegar el segundo; después se respeta la que
  elijas, aunque cargues más archivos.
- En la vista de **Hojas**, cada documento empieza con su **cabecera**: el
  color de su paquete, su nombre, cuántas hojas trae y en qué posiciones
  («hojas 4–6»), lo que encontró *Ubicar formatos* en él (Formato 1, Formato
  5, cotización) y cuántas tiene marcadas. Cada hoja lleva su lugar dentro del
  documento («2/3»).
  - **⌄** pliega el documento y deja solo la cabecera (doble clic también).
  - **Marcar todo**, **✎** renombrar, **＋** añadir archivos, imprimir y verlo
    en grande, desde la cabecera.
  - **Soltar hojas** sobre una cabecera las pone al principio de ese
    documento; **soltar un PDF** sobre ella lo añade al final de ese documento.

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

  Un enlace no puede entregarle el archivo a otra web: por eso Pdflash lo guarda y
  abre la pestaña, y tú lo arrastras ahí. Y ten presente que **lo que subas a un
  editor en línea sale de tu computadora**; eso ya depende de esa web.

## El editor: corregir, escribir, borrar y resaltar

Todo se hace **dentro de Pdflash, sobre la misma hoja**, sin otro programa ni
otra pestaña. En **Ver en grande**, pulsa **✎ Editar** (también en *Archivo ▸
Editar texto* y en el menú de cada hoja). Arriba aparece la barra del editor,
con sus herramientas a la izquierda, el formato en el centro y **Listo** a la
derecha:

| Herramienta | Qué hace |
|---|---|
| **Editar texto** | Cada trozo de texto de la hoja queda marcado con una línea punteada. Púlsalo y cámbialo ahí mismo; sale con su tamaño, su color y su negrita. |
| **Añadir texto** | Pulsa en cualquier sitio y escribe: una fecha, un número, llenar un formato. |
| **Borrador** | Arrastra sobre lo que quieras tapar: lo cubre con el color del papel. |
| **Resaltar** | Arrastra y queda resaltado en amarillo, dejando ver lo de debajo. |
| **Visto / Equis** | Pulsa donde va la marca: ✔ o ✘. |

- **Formato:** tipo de letra (Arial, Times, Courier), tamaño (A− / A+),
  negrita, cursiva y color. Se aplica a lo que estás escribiendo, a lo que
  tengas elegido o, si no hay nada, a lo próximo que escribas.
- **Mover:** todo lo que pones se arrastra a otro sitio. **Quitar** (o `Supr`)
  lo borra; en un texto corregido, «Dejar como estaba» devuelve el original.
- `Enter` deja lo escrito, `Esc` lo cancela, y `Ctrl+Z` deshace cada paso.
  **Listo** (o `Esc`) cierra el editor; lo hecho queda en la hoja.
- **También en escaneos.** Pdflash lee primero la hoja con su lector, mide la
  letra en el propio papel —su tamaño, dónde apoya y si es negrita— y tapa
  solo la palabra, sin tocar las rayas de la tabla.
- En una tabla, cada columna va por su lado: corregir un precio no arrastra
  la descripción de al lado.
- Los cambios **viajan con la hoja**, como una firma: se guardan con el
  expediente, siguen a la hoja si la giras o la mueves, y al exportar quedan
  escritos en el PDF como texto de verdad.

Lo que conviene saber:

- Un texto corregido es **un parche del color del papel con el texto nuevo
  encima**. Se ve y se imprime como el original, pero en un PDF con texto la
  palabra vieja sigue debajo del parche: un buscador todavía la encuentra.
  Para tachar datos que no deben poder recuperarse, esto no sirve todavía.
- Se corrige **renglón por renglón**: si el texto nuevo es más largo, no
  empuja los renglones de abajo. Para rehacer un párrafo entero está el
  editor avanzado.
- Las letras son las que todo PDF trae (Arial/Helvetica, Times y Courier, con
  sus negritas y cursivas). Escriben el español completo; un signo raro (un
  emoji, letras de otro alfabeto) no se puede poner, y Pdflash lo avisa.
- En un escaneo se reconoce el tamaño y la negrita, pero no el tipo de letra:
  sale en Arial, y se cambia en la barra si hace falta.
- Una hoja escaneada **de lado o de cabeza** hay que girarla antes de
  corregir su texto. Mientras el editor está abierto no se gira ni se quita
  la hoja: esos botones vuelven al pulsar **Listo**.

### Editor avanzado (otra pestaña)

Para cambios grandes sigue estando **Pdflash Editor**, un programa aparte
(<https://github.com/RenzoMoran9/HERRAMIENTA-PDF>), en *Archivo ▸ Editor
avanzado*. Recibe las hojas marcadas (o todas) **en memoria**, sin que salgan
de tu computadora, y **Devolver a Pdflash** las trae a su sitio con sus folios
y firmas. Con Pdflash guardado en tu equipo hace falta su `GrapaEditor.html`
en la misma carpeta; desde la web se usa el publicado.

> **Por qué es otro programa.** Pdflash Editor usa MuPDF, que es libre pero
> con licencia AGPL: todo programa que lo lleve *dentro* queda sujeto a esa
> licencia. El editor que trae Pdflash no usa MuPDF.

## Ubicar formatos y copiar texto (también de escaneos)

Pdflash trae su propio **lector de texto para escaneos**, PaddleOCR, que corre
dentro del navegador: sin servidor, sin internet y sin que ningún documento salga
de tu computadora. Lee bien la letra chica, las tablas, los correos y los números
de un escaneo, con tildes y eñes. Se carga solo la primera vez que hace falta
(unos 8 MB en la web; en `Grapa.html` va dentro del archivo) y usa varios
núcleos de la computadora: lee varias hojas a la vez. Una hoja con texto de
verdad se lee tal cual, sin reconocimiento; una escaneada se endereza y se lee.
Si sale al revés o de lado, lo detecta y la gira. En un navegador muy antiguo,
donde PaddleOCR no arranca, lee con Tesseract, el lector de antes.

### Ubicar los Formatos 1 y 5 y la cotización de cada empresa

En **Revisar → Ubicar y marcar los Formatos 1 y 5**, Pdflash lee el título de cada
hoja del expediente (también en escaneos) y deja marcadas, de cada empresa:

- el **Formato 1** (datos del postor);
- el **Formato 5** (precio de la oferta), y la hoja que lo continúa si la tabla de
  precios sigue en la siguiente («Formato 5 (sigue)»);
- su **hoja de cotización** (su carta, su proforma, su «oferta económica»), si la
  trae: suele tener la marca, el modelo y la procedencia que el Formato 5 calla.

Reconoce «FORMATO N° 05», «Nº 01» y títulos largos. Los correos impresos (Gmail,
Outlook) y las hojas de la propia entidad que *piden* la cotización no se marcan,
aunque nombren el ítem. Dice, paquete por paquete, qué encontró y qué falta, y
desde ahí las ves **una al lado de otra** o las **sacas a un PDF** aparte. Se
puede marcar a mano o corregir lo marcado.

### Copiar texto

En «Ver en grande», **Copiar texto** (o la tecla `T`) deja marcar un recuadro
sobre la hoja y copia su texto al portapapeles: para pasar una razón social, un
RUC o un precio a otro programa sin escribirlos. Queda a la vista lo copiado,
para corregirlo, y se puede unir todo en una sola línea. `Esc` lo apaga.

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
| `Ctrl+S` | Exportar PDF |
| `Ctrl+P` | Imprimir las hojas marcadas (o todas las que ves; en «Ver en grande», la hoja abierta) |
| `Ctrl+Mayús+S` | Guardar el expediente (para retomarlo otro día) |
| `Alt+1` … `Alt+9`, `Alt+0` | Cambiar de tablero (`Alt+0`, el décimo) |
| `Ctrl+F` | Buscar una palabra en todas las hojas · `Enter` pasa a la siguiente |
| `Ctrl+Z` / `Ctrl+Y` | Deshacer / Rehacer (escribiendo en un campo, deshacen el texto, no las hojas) |
| `Ctrl+A` | Seleccionar todas las páginas |
| `Ctrl+D` | Duplicar |
| `Supr` | Eliminar |
| `V` | Ver las hojas en grande |
| `T` | (en grande) Copiar el texto de un recuadro |
| `[` / `]` | Girar a la izquierda / derecha |
| `Clic + Shift` | Seleccionar un rango |
| `Clic + Ctrl` | Añadir o quitar de la selección |

---

## Cuentas de usuario y panel de control (opcional)

Si configuras Supabase, cada persona entra con **su propia cuenta** y tú,
como administrador, decides **qué herramientas tiene cada una** desde un
**Panel de control** dentro de Pdflash. Sin configurarlo, Pdflash sigue
funcionando como siempre, sin cuentas.

Lo que hace:

- **Pantalla de inicio de sesión** con correo y contraseña. Desde ahí se
  puede **solicitar acceso** (crear cuenta) y **recuperar la contraseña**.
- **Las cuentas nuevas quedan «pendientes»** hasta que el administrador las
  aprueba. Mientras tanto ven «Tu cuenta espera aprobación» y nada más.
- **La primera cuenta que se registra queda como administradora.** Por eso
  conviene que crees la tuya apenas termines de configurar.
- **Panel de control** (avatar, arriba a la derecha ▸ *Panel de control*):
  la lista de cuentas con buscador y filtros (pendientes, activas,
  bloqueadas), cuándo entró cada una por última vez, **Aprobar**,
  **Rechazar**, **Bloquear** o **Reactivar**, y un **interruptor por
  función**: expedientes guardados, buscar, revisar, firmas y sellos, sello
  de texto, foliación, dividir, exportar PDF, imprimir, editar texto y
  subir a otra web. Los cambios se guardan al momento.
- **Al usuario le llegan los cambios solos**, en unos minutos o al volver a
  la ventana. Lo apagado desaparece del panel lateral, y los botones de la
  barra quedan con un candado y explican que lo pida al administrador. Los
  atajos (Ctrl+S, Ctrl+P…) también respetan los permisos.
- **Cada cuenta tiene su cajón en el navegador:** si dos personas comparten
  computadora, una no ve las firmas ni los expedientes de la otra. La
  primera cuenta que entra en un navegador se queda con lo que ya había
  guardado ahí, así no se pierde nada al activar las cuentas.
- **Sin internet** se sigue trabajando con los últimos permisos durante 7
  días (se cambia en `assets/config.js`). Pasado ese plazo, pide conectarse.

**Los PDF, las firmas y los expedientes no se suben a Supabase.** Solo viajan
el correo, la contraseña (al servicio de cuentas de Supabase) y los permisos.

### Configurarlo (unos 10 minutos)

1. Crea una cuenta gratis en [supabase.com](https://supabase.com) y un
   proyecto nuevo (*New project*). Guarda la contraseña de la base de datos
   que te pide, aunque Pdflash no la usa.
2. En el proyecto, abre **SQL Editor ▸ New query**, pega todo el contenido de
   [`supabase/esquema.sql`](supabase/esquema.sql) y pulsa **Run**. Crea la
   tabla de perfiles y las reglas de seguridad.
3. En **Authentication ▸ URL Configuration**, pon en *Site URL* la dirección
   de Pdflash (`https://renzomoran9.github.io/GRAPA/`). Ahí llevan los enlaces
   de confirmar la cuenta y de recuperar la contraseña.
4. *(Opcional)* En **Authentication ▸ Sign In / Providers ▸ Email** puedes
   apagar *Confirm email* si no quieres que cada persona confirme su correo
   antes de entrar. Igual tiene que aprobarla el administrador.
5. En **Project Settings ▸ API** (o el botón **Connect**) copia la *Project
   URL* y la clave *anon / publishable* en
   [`assets/config.js`](assets/config.js). **Nunca** pongas ahí la clave
   *service_role* ni la *secret*.
6. Regenera el archivo único con `node construir.mjs` y sube los cambios.
7. Abre Pdflash, pulsa **Solicitar acceso** y crea **tu** cuenta: al ser la
   primera, quedas como administrador.

Para **borrar** una cuenta del todo: Supabase ▸ **Authentication ▸ Users**.
Desde el panel se puede bloquear, que basta para cortar el acceso.

**Qué tan seguro es.** Las reglas viven en la base de datos: nadie puede
darse permisos a sí mismo ni ver las cuentas de otros, aunque sepa
programar, y la base no deja quitar ni bloquear al último administrador.
Pero el trabajo con los PDF ocurre en el navegador de cada persona, así que
alguien con conocimientos técnicos podría modificar su copia de Pdflash para
saltarse un botón apagado. Para un equipo de oficina es suficiente; no es
una protección contra alguien decidido a burlarla.

## Privacidad

Pdflash **no tiene servidor** para tus documentos (las cuentas opcionales solo
guardan correo y permisos). Los PDF se leen y se rearman dentro del navegador,
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
  ocr.js              leer una hoja: texto de verdad o reconocimiento de un escaneo
  ofertas.js          reconocer cada hoja: Formato 1, Formato 5, cotización, correo
  revisar.js          hojas en blanco, de lado, de cabeza o torcidas
  expedientes.js      guardado del trabajo (IndexedDB) y carpeta de salida
  firmas.js           limpieza de fondo, recorte desde escaneo, dibujo
  app.js              interfaz: rejilla de páginas, arrastre, foliación, lector, dividir
  guia.js             primeros pasos: recorrido guiado y expediente de ejemplo
  config.js           datos de Supabase para las cuentas (vacíos = sin cuentas)
  cuentas.js          inicio de sesión, permisos por función y panel de control
supabase/esquema.sql  tabla de perfiles y reglas de seguridad para Supabase
lib/                  pdf-lib, pdf.js y JSZip incluidos (ver lib/LICENCIAS.md)
lib/ocr/              el lector de escaneos: PaddleOCR (ONNX Runtime y sus modelos)
                      y, de respaldo, tesseract-wasm con el idioma español
construir.mjs         arma Grapa.html, el archivo único
servidor.mjs          servidor estático opcional, sin dependencias
pruebas/correr.mjs    pruebas en un navegador de verdad (Chromium, con Playwright)
pruebas/cuentas.mjs   pruebas de las cuentas contra un Supabase simulado
```

Sin build, sin `npm install`, sin framework: archivos estáticos. Para regenerar
el archivo único después de tocar el código:

```bash
node construir.mjs
```

### Pruebas

`pruebas/correr.mjs` abre Pdflash en Chromium y repite lo que haría una
persona: cargar, soltar un PDF entre dos hojas, deshacer, abrir diez
tableros, cerrar sin guardar, recuperar el autoguardado con dos ventanas,
exportar y leer los folios del PDF que sale, la ruta, las cabeceras, los
avisos, la memoria y la base de datos. Cada prueba empieza con el navegador
limpio. Necesita Playwright, que no forma parte de Pdflash; se instala una vez:

```bash
npm install --no-save playwright
```

```bash
npx playwright install chromium
```

Y se corren todas, o solo las que contengan una palabra:

```bash
node pruebas/correr.mjs
```

```bash
node pruebas/correr.mjs tableros
```

Las de las cuentas (entrar, permisos, panel de control, cajón por cuenta,
sin internet) van aparte y no necesitan un Supabase de verdad: lo simulan.

```bash
node pruebas/cuentas.mjs
```

### Nota técnica sobre `file://`

Los navegadores no dejan crear *Web Workers* desde `file://`. Cuando Pdflash
detecta ese caso, carga `pdf.worker.min.js` como script normal y pdf.js trabaja
en el hilo principal: por eso funciona con doble clic. Servida por web usa el
worker de verdad y va más rápido con documentos largos.

---

## Ideas para más adelante

- Índice o carátula automática con la lista de documentos y sus folios.
