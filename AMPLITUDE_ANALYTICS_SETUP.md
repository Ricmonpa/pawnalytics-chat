# Amplitude Analytics Setup - Pawnalytics

## 📊 Configuración de Amplitude Analytics

### ✅ Configuración Completada

Amplitude Analytics ha sido configurado exitosamente en Pawnalytics con la siguiente configuración:

- **API Key**: `6c03f5877ee8a21940cad6f0a93ccf7a`
- **Proyecto**: Pawnalytics Vercel Chat
- **SDK**: `@amplitude/analytics-browser`
- **Session Replay**: ✅ Activado al 100% (todas las sesiones grabadas)

### 📁 Archivos Configurados

1. **`src/amplitude.js`** - Configuración principal de Amplitude
2. **`src/main.jsx`** - Inicialización de Amplitude al cargar la app
3. **`src/App.jsx`** - Tracking de eventos en puntos clave

### 🎯 Eventos Rastreados

#### Eventos de Chat
- `chat_message_sent` - Cuando el usuario envía un mensaje
- `chat_message_received` - Cuando se recibe una respuesta

#### Eventos de Análisis de Imágenes
- `image_analysis_started` - Inicio de análisis de imagen
- `image_analysis_completed` - Análisis de imagen completado exitosamente
- `image_analysis_error` - Error en análisis de imagen

#### Eventos de Análisis de Audio
- `audio_analysis_started` - Inicio de análisis de audio
- `audio_analysis_completed` - Análisis de audio completado
- `audio_analysis_error` - Error en análisis de audio

#### Eventos de Usuario
- `user_login` - Login exitoso (Google/Email)
- `user_logout` - Logout del usuario
- `user_registered` - Registro de nuevo usuario

#### Eventos de Navegación
- `page_viewed` - Visualización de página
- `feature_used` - Uso de funcionalidad específica
- `language_changed` - Cambio de idioma

#### Eventos de Funcionalidades Específicas
- `prediagnostic_generated` - Prediagnóstico generado
- `guide_viewed` - Guía visualizada
- `error_occurred` - Error general

### 🔧 Funciones Disponibles

#### `trackEvent(eventName, properties)`
Rastrea un evento personalizado con propiedades opcionales.

```javascript
import { trackEvent, PAWNALYTICS_EVENTS } from './amplitude';

// Ejemplo de uso
trackEvent(PAWNALYTICS_EVENTS.IMAGE_ANALYSIS_STARTED, {
  hasContext: true,
  functionType: 'specialized',
  language: 'es'
});
```

#### `setUser(userId, userProperties)`
Establece el ID de usuario y propiedades del usuario.

```javascript
import { setUser } from './amplitude';

// Ejemplo de uso
setUser('user123', {
  email: 'user@example.com',
  displayName: 'John Doe',
  language: 'es'
});
```

#### `initAmplitude()`
Inicializa Amplitude con la configuración predeterminada.

### 📈 Propiedades de Eventos

#### Eventos de Mensajes
```javascript
{
  messageType: 'text|image|video|audio',
  hasText: boolean,
  hasFile: boolean,
  language: 'es|en'
}
```

#### Eventos de Análisis
```javascript
{
  hasContext: boolean,
  functionType: 'specialized|general',
  success: boolean,
  error: string,
  language: 'es|en'
}
```

#### Eventos de Usuario
```javascript
{
  method: 'google|email',
  userId: string,
  email: string,
  language: 'es|en'
}
```

### 🚀 Cómo Agregar Nuevos Eventos

1. **Definir el evento** en `src/amplitude.js`:
```javascript
export const PAWNALYTICS_EVENTS = {
  // ... eventos existentes
  NEW_FEATURE_USED: 'new_feature_used',
};
```

2. **Rastrear el evento** en el componente:
```javascript
import { trackEvent, PAWNALYTICS_EVENTS } from './amplitude';

// En tu función
trackEvent(PAWNALYTICS_EVENTS.NEW_FEATURE_USED, {
  featureName: 'nueva_funcionalidad',
  language: i18n.language
});
```

### 📊 Dashboard de Amplitude

Accede al dashboard de Amplitude en:
- **URL**: https://analytics.amplitude.com/
- **Proyecto**: Pawnalytics Vercel Chat
- **API Key**: `6c03f5877ee8a21940cad6f0a93ccf7a`

### 🔍 Eventos Importantes a Monitorear

1. **Engagement**: `chat_message_sent`, `image_analysis_started`
2. **Conversión**: `user_login`, `user_registered`
3. **Errores**: `image_analysis_error`, `audio_analysis_error`
4. **Funcionalidades**: `prediagnostic_generated`, `guide_viewed`

### 🛠️ Configuración Avanzada

#### Personalizar Configuración
```javascript
// En src/amplitude.js
const amplitudeConfig = {
  apiKey: "6c03f5877ee8a21940cad6f0a93ccf7a",
  logLevel: 'DEBUG', // Para desarrollo
  serverZone: 'US',
  // Configuraciones adicionales
};
```

#### Eventos de Sesión
```javascript
// Rastrear inicio de sesión
trackEvent('session_started', {
  timestamp: new Date().toISOString(),
  userAgent: navigator.userAgent
});
```

### 📱 Eventos Móviles Específicos

Para funcionalidades móviles como grabación de audio/video:

```javascript
// Grabación de audio
trackEvent('audio_recording_started', {
  duration: recordingTime,
  quality: audioQuality
});

// Grabación de video
trackEvent('video_recording_started', {
  duration: recordingTime,
  resolution: videoResolution
});
```

### 🔒 Privacidad y Cumplimiento

- Los eventos no contienen información médica sensible
- Se rastrea solo información de uso y funcionalidades
- Cumple con GDPR y regulaciones de privacidad
- Los datos se almacenan de forma segura en Amplitude

### 📈 Métricas Clave a Monitorear

1. **Retención de Usuarios**
   - Usuarios que regresan después del primer uso
   - Frecuencia de uso por usuario

2. **Engagement por Funcionalidad**
   - Análisis de imágenes vs texto
   - Uso de grabación de audio/video
   - Visualización de guías

3. **Conversión**
   - Registro de usuarios
   - Login con Google vs Email
   - Completación de análisis

4. **Errores y Problemas**
   - Errores en análisis de imágenes
   - Problemas de autenticación
   - Fallos en grabación de audio/video

### 🎬 Session Replay - Grabación de Sesiones

Session Replay está configurado para grabar el 100% de las sesiones de usuario:

#### Configuración Actual
- **Sample Rate**: 100% (todas las sesiones)
- **Privacidad**: Datos sensibles enmascarados (passwords, emails, teléfonos)
- **Captura**: Texto de consultas y chat visible para análisis
- **Performance**: Optimizado con slimDOM

#### Cómo Ver las Grabaciones
1. Accede a [Amplitude Dashboard](https://analytics.amplitude.com/)
2. Ve a la sección "Session Replay"
3. Filtra por usuario, evento o fecha
4. Reproduce las sesiones para ver exactamente qué hacen los usuarios

#### Qué Puedes Ver
- ✅ Flujo completo de navegación
- ✅ Consultas que escriben los usuarios
- ✅ Clics e interacciones
- ✅ Errores que encuentran
- ✅ Tiempo en cada sección
- ❌ Passwords (enmascarados)
- ❌ Emails (enmascarados)
- ❌ Teléfonos (enmascarados)

### 🎯 Próximos Pasos

1. **Monitorear eventos** en el dashboard de Amplitude
2. **Ver Session Replays** para entender comportamiento de usuarios
3. **Crear cohortes** de usuarios activos
4. **Analizar funnel** de conversión
5. **Optimizar** basado en datos de uso y grabaciones
6. **Agregar eventos** para nuevas funcionalidades

### 📞 Soporte

Para preguntas sobre la configuración de Amplitude:
- Revisar la [documentación oficial de Amplitude](https://developers.amplitude.com/)
- Consultar el dashboard de Amplitude para métricas en tiempo real
- Contactar al equipo de desarrollo para implementación de nuevos eventos 