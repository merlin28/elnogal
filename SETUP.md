# Despliegue de tu copia — Reporte de Daños "Club Residencial El Nogal"

Esta guía te guiará paso a paso para conectar la aplicación de reporte de afectaciones de tu conjunto residencial (**Club Residencial El Nogal**) a tu propio backend de Google (Google Sheets, carpeta de Google Drive y proyecto de Apps Script).

---

## Resumen de lo que necesitas crear (todo gratis, con tu cuenta de Google)

1. Un **Google Sheet** vacío para guardar los registros y credenciales de acceso.
2. Una **carpeta de Google Drive** para almacenar las evidencias (fotos, videos y documentos) organizadas por torre y apartamento.
3. Un **proyecto de Google Apps Script** (el backend) configurado como Web App.
4. Un **repositorio de GitHub** con GitHub Pages activado (el frontend).

---

## Paso 1 — Crear el Google Sheet de resultados

1. Ve a [sheets.google.com](https://sheets.google.com) y crea una hoja de cálculo en blanco.
2. Ponle un nombre descriptivo, ej. `Club Residencial El Nogal — Registro de Daños`.
3. Copia el ID de la hoja desde la barra de direcciones de tu navegador:
   `https://docs.google.com/spreadsheets/d/`**`TU_SPREADSHEET_ID`**`/edit#gid=0`
4. Guarda este ID, lo necesitarás en el paso 3.

*Nota: No es necesario crear las pestañas ni columnas a mano. La función de inicialización del backend (Paso 3) las creará y estructurará automáticamente.*

---

## Paso 2 — Crear la carpeta de Google Drive para evidencias

1. Ve a [drive.google.com](https://drive.google.com) y crea una carpeta nueva con el nombre `Evidencias Daños — El Nogal`.
2. Ábrela y copia el ID de la carpeta de la URL del navegador:
   `https://drive.google.com/drive/folders/`**`TU_DRIVE_FOLDER_ID`**
3. Guarda este ID para el paso 3.
4. *(Opcional pero recomendado)* Mueve el Google Sheet creado en el Paso 1 dentro de esta carpeta para mantener ordenado el proyecto.

---

## Paso 3 — Configurar y desplegar el backend (Google Apps Script)

1. Ve a [script.google.com](https://script.google.com) y crea un **Nuevo proyecto**.
2. Borra el código por defecto del archivo `Código.gs` y pega en él el contenido completo de [`gas/Code.gs`](file:///c:/Users/hadiaz/Downloads/mi-copia-diagnosticoafectaciones/mi-copia/gas/Code.gs).
3. En el editor de Apps Script, ve al menú **Configuración del proyecto** (icono de engranaje ⚙️ en la barra lateral izquierda) y marca la casilla **"Mostrar archivo de manifiesto appsscript.json en el editor"**.
4. Regresa al editor de código, abre el archivo `appsscript.json` recién visible y reemplaza su contenido con el del archivo [`gas/appsscript.json`](file:///c:/Users/hadiaz/Downloads/mi-copia-diagnosticoafectaciones/mi-copia/gas/appsscript.json).
5. En `Code.gs`, completa las variables de configuración en la parte superior del archivo:
   - `DRIVE_ROOT_ID` ➔ El ID de la carpeta de Google Drive del **Paso 2**.
   - `RESULTS_SHEET_ID` ➔ El ID del Google Sheet del **Paso 1**.
   - `FRONTEND_ORIGIN` ➔ Por ahora puedes colocar `*` o dejarlo vacío; lo actualizarás en el **Paso 5** con la URL pública de tu GitHub Pages para asegurar las subidas de archivos.
6. Haz clic en el botón de **Guardar** (icono de disquete).
7. **Ejecutar la inicialización**:
   - En la barra de herramientas superior, selecciona la función `inicializar` en el menú desplegable y haz clic en **Ejecutar**.
   - Se abrirá un cuadro de diálogo solicitando autorización. Haz clic en **Revisar permisos** ➔ selecciona tu cuenta de Google ➔ haz clic en **Avanzado** ➔ **Ir a [Nombre del Proyecto] (no seguro)** ➔ **Permitir**.
   - Esto creará automáticamente las pestañas `registros` y `credenciales` en tu Google Sheet, poblando esta última con las cuentas de acceso por defecto.
8. **Desplegar como aplicación web**:
   - Haz clic en el botón azul **Implementar ➔ Nueva implementación** (esquina superior derecha).
   - Tipo de implementación: Selecciona **Aplicación web** haciendo clic en el engranaje de configuración.
   - En la configuración:
     - **Ejecutar como**: Selecciona **Yo** (tu cuenta de Google).
     - **Quién tiene acceso**: Selecciona **Cualquier usuario** (esto es crucial para que los propietarios puedan enviar sus reportes sin iniciar sesión en Google).
   - Haz clic en **Implementar**.
   - Copia la **URL de la aplicación web** que se genera (termina en `/exec`).

---

## Paso 4 — Conectar el frontend al backend

1. En tu editor local, abre el archivo [`js/config.js`](file:///c:/Users/hadiaz/Downloads/mi-copia-diagnosticoafectaciones/mi-copia/js/config.js).
2. Reemplaza el valor de la propiedad `GAS_URL` con la URL de la aplicación web que copiaste al final del **Paso 3**:
   ```javascript
   const CONFIG = {
     GAS_URL: 'https://script.google.com/macros/s/.../exec',
     ...
   };
   ```
3. Guarda los cambios.

---

## Paso 5 — Publicar el frontend en GitHub Pages

1. Crea un repositorio en GitHub (puede ser público o privado).
2. Sube todo el contenido de este directorio local (excepto la carpeta `gas/`, que no es requerida en producción pero puedes conservarla como respaldo).
3. En la interfaz web de tu repositorio de GitHub, ve a **Settings ➔ Pages**.
4. En la sección **Build and deployment**, selecciona la rama `main` (o `master`) y la carpeta raíz (`/`), luego haz clic en **Save**.
5. Tras unos minutos, GitHub te dará una URL pública del tipo:
   `https://tu-usuario.github.io/tu-repositorio/`
6. Abre tu proyecto en Apps Script y actualiza la variable `FRONTEND_ORIGIN` en `Code.gs` con el dominio base de tu sitio (ej. `https://tu-usuario.github.io`).
7. **Aplica los cambios en Apps Script**:
   - Ve a **Implementar ➔ Gestionar implementaciones**.
   - Haz clic en el icono del lápiz (Editar) del despliegue activo.
   - En **Versión**, elige **Nueva versión**.
   - Haz clic en **Implementar**.

---

## Verificación de Funcionamiento

### 1. Formulario de Propietarios (`index.html`)
- Abre el formulario en la web o localmente.
- Los selectores de torre y apartamento deben cargarse sin problemas.
- Intenta registrar un apartamento de prueba (ej. `Torre 3`, `Apto 402`), escribe una descripción corta y adjunta una foto.
- Presiona **Guardar y enviar reporte**. El sistema debe crear la estructura `Torre 3 / 402` en tu carpeta de Drive, guardar la foto, y añadir la fila en la pestaña `registros` de tu Google Sheet.

### 2. Panel de Control Administrativo (`dashboard.html`)
- Abre el panel de control. Verás una pantalla de **Acceso Administrativo**.
- Introduce las credenciales por defecto (creadas en la pestaña `credenciales` de tu Google Sheet):
  - **Administrador**: `admin@conjunto.com` / contraseña: `admin123`
  - **Coordinador**: `coordinador@conjunto.com` / contraseña: `coord123`
- Al presionar **Ingresar al Panel**, la pantalla de login se ocultará y cargará de forma segura las estadísticas de reportes, el gráfico de barras por torre y la tabla interactiva de apartamentos afectados.
