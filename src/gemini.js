import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  analyzeObesityWithRoboflow,
  analyzeCataractsWithRoboflow,
  analyzeDysplasiaWithRoboflow,
  autoAnalyzeWithRoboflow,
  formatRoboflowResults,
  createSpecialistContextForGemini,
  getRoboflowStatus,
  logRoboflowUsage
} from './roboflow.js';

// Configuración de Gemini
const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY || 'your-api-key-here');
const model = genAI.getGenerativeModel({ model: "gemini-pro-latest" });

// === SYSTEM PROMPT CENTRALIZADO ===
const getSystemPrompt = (userMessage = '', forcedLanguage = null) => {
  const basePrompt = `Eres Pawnalytics, un asistente veterinario especializado en análisis de mascotas. Tu primera tarea es detectar el idioma de la pregunta del usuario. Debes responder obligatoriamente en el mismo idioma que el usuario utilizó. Si te preguntan en español, respondes en español. Si te preguntan en francés, respondes en francés. No traduzcas tu respuesta a menos que te lo pidan.

${forcedLanguage ? `INSTRUCCIÓN ESPECÍFICA: Responde únicamente en ${forcedLanguage === 'es' ? 'español' : 'inglés'}.` : ''}

**IMPORTANTE - NUNCA RECHAZES UNA CONSULTA:**
- Si el usuario hace una consulta simple o incompleta, SIEMPRE debes ayudarlo
- NUNCA digas "no puedo ayudarte" o "necesito más información" sin ofrecer ayuda
- SIEMPRE pide información adicional de manera constructiva y útil
- Trabaja con la información disponible y pide lo que falte

**EJEMPLOS DE BUENAS RESPUESTAS:**
- Si dicen "mi perrito está gordo": "Entiendo tu preocupación. Para darte la mejor recomendación, ¿puedes compartir una foto de tu perrito en vista aérea? También necesito saber: ¿qué edad tiene? ¿qué raza o tipo? ¿puedes sentir sus costillas cuando las tocas? ¿sabes cuánto pesa?"
- Si dicen "mi gato tiene algo en la piel": "Veo que hay algo en la piel de tu gato. Para analizarlo mejor, ¿puedes tomar una foto clara de la zona afectada? También necesito saber: ¿cuándo apareció? ¿le pica? ¿se rasca mucho? ¿ha cambiado de tamaño?"

**INSTRUCCIONES ESPECÍFICAS:**
1. SIEMPRE reconoce la preocupación del usuario
2. SIEMPRE pide información adicional de manera constructiva
3. SIEMPRE ofrece ayuda con la información disponible
4. NUNCA rechaces una consulta por falta de información
5. SIEMPRE guía al usuario para obtener la información necesaria

Mensaje del usuario: ${userMessage}

Recuerda: Siempre responde en el mismo idioma que el usuario utilizó y NUNCA rechaces una consulta.`;

  return basePrompt;
};

// Función para detectar consultas incompletas y generar respuestas proactivas
const detectIncompleteConsultation = (message, language = 'es') => {
  const lowerMessage = message.toLowerCase();

  // NO interceptar si es una respuesta de seguimiento
  if (message.includes('Respuesta a preguntas de seguimiento:')) {
    console.log('🔍 Respuesta de seguimiento detectada, no interceptando');
    return null;
  }

  // NO interceptar si el mensaje contiene información específica que indica respuesta a preguntas
  const followUpIndicators = [
    'años', 'año', 'meses', 'mes', 'semanas', 'semana', 'días', 'día',
    'yorkshire', 'labrador', 'pastor', 'bulldog', 'chihuahua', 'poodle', 'german shepherd',
    'macho', 'hembra', 'macho', 'female', 'male',
    'hace', 'desde', 'cuando', 'empezó', 'comenzó', 'noté', 'notaste',
    'progresivamente', 'gradualmente', 'repentinamente', 'de repente',
    'no recibe', 'no toma', 'no le doy', 'no le damos', 'sin medicamento',
    'no presenta', 'no tiene', 'no muestra', 'no hay'
  ];

  // Si el mensaje contiene múltiples indicadores de respuesta a preguntas, no interceptar
  const followUpCount = followUpIndicators.filter(indicator => lowerMessage.includes(indicator)).length;
  if (followUpCount >= 2) {
    console.log('🔍 Múltiples indicadores de respuesta de seguimiento detectados, no interceptando');
    return null;
  }

  // Patrones de consultas incompletas comunes
  const incompletePatterns = {
    obesity: ['gordo', 'gorda', 'obeso', 'obesa', 'peso', 'engordó', 'engordó', 'sobrepeso'],
    skin: ['piel', 'mancha', 'roncha', 'herida', 'llaga', 'costra', 'alergia', 'picazón', 'rascado'],
    eye: ['ojo', 'ojos', 'catarata', 'ceguera', 'lágrimas', 'secreción'],
    dental: ['diente', 'dientes', 'boca', 'mal aliento', 'sarro', 'gingivitis'],
    behavior: ['comportamiento', 'agresivo', 'triste', 'deprimido', 'nervioso', 'ansioso'],
    digestive: ['vómito', 'diarrea', 'no come', 'no come', 'apetito', 'estómago'],
    respiratory: ['tos', 'estornudo', 'respiración', 'respira', 'nariz', 'mocos']
  };

  // Detectar qué tipo de consulta es
  let consultationType = null;
  for (const [type, patterns] of Object.entries(incompletePatterns)) {
    if (patterns.some(pattern => lowerMessage.includes(pattern))) {
      consultationType = type;
      break;
    }
  }

  if (!consultationType) return null;

  // Generar respuesta proactiva según el tipo de consulta
  const responses = {
    obesity: {
      es: "Entiendo tu preocupación sobre el peso de tu mascota. Para darte la mejor recomendación, necesito más información: ¿puedes compartir una foto de tu mascota en vista aérea (desde arriba)? También necesito saber: ¿qué edad tiene? ¿qué raza o tipo? ¿puedes sentir sus costillas cuando las tocas? ¿sabes cuánto pesa actualmente? ¿ha cambiado su apetito recientemente?",
      en: "I understand your concern about your pet's weight. To give you the best recommendation, I need more information: can you share a photo of your pet from above (aerial view)? I also need to know: how old is it? what breed or type? can you feel its ribs when you touch them? do you know how much it currently weighs? has its appetite changed recently?"
    },
    skin: {
      es: "Veo que hay algo en la piel de tu mascota. Para analizarlo mejor, ¿puedes tomar una foto clara de la zona afectada? También necesito saber: ¿cuándo apareció? ¿le pica o se rasca mucho? ¿ha cambiado de tamaño o color? ¿hay otras mascotas en casa? ¿ha estado en contacto con algo nuevo?",
      en: "I see there's something on your pet's skin. To analyze it better, can you take a clear photo of the affected area? I also need to know: when did it appear? does it itch or scratch a lot? has it changed size or color? are there other pets at home? has it been in contact with something new?"
    },
    eye: {
      es: "Entiendo tu preocupación sobre los ojos de tu mascota. Para evaluarlo mejor, ¿puedes tomar una foto clara de sus ojos? También necesito saber: ¿cuándo empezó el problema? ¿hay secreción o lágrimas? ¿se frota los ojos? ¿ha cambiado su comportamiento? ¿puede ver normalmente?",
      en: "I understand your concern about your pet's eyes. To evaluate it better, can you take a clear photo of its eyes? I also need to know: when did the problem start? is there discharge or tears? does it rub its eyes? has its behavior changed? can it see normally?"
    },
    dental: {
      es: "Entiendo tu preocupación sobre la salud dental de tu mascota. Para evaluarlo mejor, ¿puedes tomar una foto de su boca si es posible? También necesito saber: ¿qué edad tiene? ¿cuándo fue su última limpieza dental? ¿tiene mal aliento? ¿come normalmente? ¿ha cambiado su apetito?",
      en: "I understand your concern about your pet's dental health. To evaluate it better, can you take a photo of its mouth if possible? I also need to know: how old is it? when was its last dental cleaning? does it have bad breath? does it eat normally? has its appetite changed?"
    },
    behavior: {
      es: "Entiendo tu preocupación sobre el comportamiento de tu mascota. Para ayudarte mejor, necesito saber: ¿qué edad tiene? ¿cuándo empezó este comportamiento? ¿ha habido cambios recientes en casa? ¿hay otros animales? ¿ha tenido algún evento estresante? ¿puedes describir el comportamiento específico?",
      en: "I understand your concern about your pet's behavior. To help you better, I need to know: how old is it? when did this behavior start? have there been recent changes at home? are there other animals? has it had any stressful events? can you describe the specific behavior?"
    },
    digestive: {
      es: "Entiendo tu preocupación sobre el sistema digestivo de tu mascota. Para evaluarlo mejor, necesito saber: ¿qué edad tiene? ¿cuándo empezaron los síntomas? ¿qué come normalmente? ¿ha comido algo diferente? ¿hay otros síntomas? ¿puedes tomar una foto si hay algo visible?",
      en: "I understand your concern about your pet's digestive system. To evaluate it better, I need to know: how old is it? when did the symptoms start? what does it normally eat? has it eaten something different? are there other symptoms? can you take a photo if there's something visible?"
    },
    respiratory: {
      es: "Entiendo tu preocupación sobre la respiración de tu mascota. Para evaluarlo mejor, necesito saber: ¿qué edad tiene? ¿cuándo empezó el problema? ¿es constante o intermitente? ¿hay otros síntomas? ¿ha estado expuesto a algo? ¿puedes grabar un video corto de la respiración?",
      en: "I understand your concern about your pet's breathing. To evaluate it better, I need to know: how old is it? when did the problem start? is it constant or intermittent? are there other symptoms? has it been exposed to something? can you record a short video of the breathing?"
    }
  };

  return responses[consultationType]?.[language] || responses[consultationType]?.es || null;
};

// === FUNCIONES DE INICIALIZACIÓN Y COMUNICACIÓN ===

// Función para inicializar chat de Gemini
export const initializeGeminiChat = () => {
  console.log('🤖 Inicializando chat de Gemini...');
  try {
    // Crear un objeto chat compatible con la API actual
    const chat = {
      history: [],
      sendMessage: async (message) => {
        console.log('📤 Enviando mensaje a Gemini...');
        const result = await model.generateContent(message);
        return {
          response: result.response
        };
      }
    };
    console.log('✅ Chat de Gemini inicializado correctamente');
    return chat;
  } catch (error) {
    console.error('❌ Error inicializando chat de Gemini:', error);
    // Fallback: crear un objeto chat básico
    return {
      sendMessage: async (message) => {
        console.log('🔄 Usando fallback para Gemini');
        const result = await model.generateContent(message);
        return {
          response: result.response
        };
      }
    };
  }
};

// Función para procesar archivos multimedia
export const processMultimediaFile = async (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      // Extraer solo los datos Base64 puros del Data URL
      const base64Data = dataUrl.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// Función auxiliar para limpiar datos de imagen si ya vienen como Data URL
export const cleanImageData = (imageData) => {
  if (typeof imageData === 'string') {
    // Si ya es un Data URL, extraer solo los datos Base64
    if (imageData.startsWith('data:')) {
      return imageData.split(',')[1];
    }
    // Si ya es Base64 puro, devolverlo tal como está
    return imageData;
  }
  return imageData;
};

// Función para detectar si un mensaje es una respuesta de seguimiento
const detectFollowUpResponse = (message, chatHistory) => {
  if (!chatHistory || chatHistory.length === 0) return false;

  // Obtener el último mensaje del asistente
  const lastAssistantMessage = chatHistory
    .slice()
    .reverse()
    .find(msg => msg.role === 'assistant');

  if (!lastAssistantMessage) return false;

  const lowerMessage = message.toLowerCase().trim();
  const assistantContent = lastAssistantMessage.content.toLowerCase();

  // Patrones que indican respuesta de seguimiento
  const followUpPatterns = [
    // Respuestas a preguntas numeradas
    /^\s*\d+\.\s*\w+/,  // "1. 9 años", "2. yorkshire", etc.
    /^\s*\d+\)\s*\w+/,  // "1) 9 años", "2) yorkshire", etc.
    /^\s*\d+[\s-]+\w+/, // "1 - 9 años", "2 yorkshire", etc.

    // Respuestas cortas típicas a preguntas
    /^(sí|si|yes|no|not?)$/,
    /^(sí|si|yes|no|not?)\s*[,.]?\s*$/,

    // Múltiples respuestas numeradas en el mismo mensaje
    /\d+\.\s*\w+.*\d+\.\s*\w+/,
    /\d+\)\s*\w+.*\d+\)\s*\w+/,

    // Respuestas a preguntas específicas sobre mascotas
    /^\s*(macho|hembra|male|female)\s*$/,
    /^\s*\d+\s*(años?|year|month|mes)/,
    /^\s*(perro|gato|dog|cat|canino|felino)/,
    /^\s*(yorkshire|labrador|pastor|bulldog|chihuahua|poodle|golden|beagle|husky)/,

    // Respuestas naturales que contienen información solicitada
    /\d+\s*años?/,  // "9 años", "2 años"
    /(tiene|es)\s*\d+\s*años?/,  // "tiene 9 años", "es un yorkshire"
    /(no|no tiene|no he|no ha)\s+(notado|cambiado|enfermedad)/,  // "no he notado", "no tiene enfermedad"
    /(hace|desde|durante)\s+(más|mas)\s+de\s+un\s+año/,  // "hace más de un año"
    /(ha|han)\s+(ido|estado)\s+(avanzando|empeorando)/,  // "ha ido avanzando"
  ];

  // Verificar si el mensaje coincide con patrones de respuesta de seguimiento
  const matchesPattern = followUpPatterns.some(pattern => pattern.test(lowerMessage));

  // Verificar si el último mensaje del asistente contenía preguntas
  const lastMessageHadQuestions = /\?/.test(assistantContent) ||
    /necesito saber|need to know|por favor|please|cuéntame|tell me/.test(assistantContent);

  // Verificar si el último mensaje tenía lista numerada
  const lastMessageHadNumberedList = /\d+\./.test(assistantContent);

  // Es respuesta de seguimiento si:
  // 1. Coincide con patrones Y el último mensaje tenía preguntas
  // 2. O si el mensaje es muy corto pero el asistente hizo preguntas con lista numerada
  // 3. O si el asistente hizo preguntas específicas y el usuario responde con información relevante
  const isFollowUp = (matchesPattern && lastMessageHadQuestions) ||
    (lowerMessage.length < 50 && lastMessageHadQuestions && lastMessageHadNumberedList) ||
    (lastMessageHadQuestions && lowerMessage.length < 200 && (
      lowerMessage.includes('años') ||
      lowerMessage.includes('yorkshire') ||
      lowerMessage.includes('no') ||
      lowerMessage.includes('hace') ||
      lowerMessage.includes('ha ido')
    ));

  console.log('🔍 DEBUG - Detección de respuesta de seguimiento:', {
    message: lowerMessage,
    matchesPattern,
    lastMessageHadQuestions,
    lastMessageHadNumberedList,
    isFollowUp,
    messageLength: lowerMessage.length
  });

  return isFollowUp;
};

// Función para enviar mensaje de texto
export const sendTextMessage = async (chat, message, currentLanguage = 'es', chatHistory = []) => {
  try {
    console.log('🚀 INICIO sendTextMessage - Mensaje recibido:', message);
    console.log('🚀 INICIO sendTextMessage - Longitud del historial pasado:', chatHistory.length);
    console.log('🌍 Idioma determinado:', currentLanguage);
    console.log('📚 Historial de chat proporcionado:', chatHistory.length > 0);

    // === NUEVO SISTEMA DE DETECCIÓN DE CONSULTAS INCOMPLETAS ===
    // Detectar si es una consulta incompleta que necesita información adicional
    const incompleteResponse = detectIncompleteConsultation(message, currentLanguage);

    if (incompleteResponse) {
      console.log('🔍 Consulta incompleta detectada, proporcionando respuesta proactiva');
      return incompleteResponse;
    }

    // === NUEVO SISTEMA DE DETECCIÓN AUTOMÁTICA DE IDIOMAS ===
    // Construir el prompt con instrucciones de detección automática
    let languagePrompt = getSystemPrompt(message, currentLanguage);

    // Detectar si es una respuesta de seguimiento basada en patrones
    const isFollowUpResponse = detectFollowUpResponse(message, chatHistory);

    // Si hay historial de chat y es una respuesta de seguimiento, incluir contexto
    if (chatHistory.length > 0 && isFollowUpResponse) {
      console.log('🔄 Incluyendo contexto de conversación anterior para respuesta de seguimiento');

      // Extraer los últimos mensajes relevantes (últimos 4 mensajes)
      const relevantHistory = chatHistory.slice(-4);
      const contextMessages = relevantHistory.map(msg => {
        if (msg.role === 'user') {
          let userMessage = `Usuario: ${msg.content}`;
          // Agregar información sobre archivos adjuntos
          if (msg.image || msg.imageUrl) {
            userMessage += ` [Adjuntó una imagen]`;
          }
          if (msg.video || msg.videoUrl) {
            userMessage += ` [Adjuntó un video]`;
          }
          if (msg.audio || msg.audioUrl) {
            userMessage += ` [Adjuntó un audio]`;
          }
          return userMessage;
        } else if (msg.role === 'assistant') {
          return `Asistente: ${msg.content}`;
        }
        return '';
      }).filter(msg => msg !== '');

      // Buscar si hay análisis previo de imagen en el historial completo
      let imageAnalysisContext = '';
      const fullHistory = chatHistory.slice(-8); // Buscar en los últimos 8 mensajes

      for (let i = 0; i < fullHistory.length - 1; i++) {
        const currentMsg = fullHistory[i];
        const nextMsg = fullHistory[i + 1];

        // Si el usuario adjuntó una imagen y el asistente respondió con análisis
        if (currentMsg.role === 'user' && (currentMsg.image || currentMsg.imageUrl) &&
          nextMsg.role === 'assistant' && nextMsg.content.length > 200) {

          // Extraer las primeras líneas del análisis (hasta el primer salto de línea doble)
          const analysisLines = nextMsg.content.split('\n\n');
          const briefAnalysis = analysisLines.slice(0, 3).join('\n\n'); // Primeros 3 párrafos para incluir más detalles visuales

          imageAnalysisContext = `\n\n=== ANÁLISIS PREVIO DE LA IMAGEN ===\n${briefAnalysis}\n\nRECUERDA: Esta es la imagen que analizaste anteriormente. SIEMPRE haz referencia a estos detalles visuales específicos en tu respuesta.`;
          break;
        }
      }

      const contextString = contextMessages.join('\n\n');

      // Verificar si hay imágenes en el contexto para mejorar el prompt
      const hasImagesInContext = contextMessages.some(msg => msg.includes('[Adjuntó una imagen]'));

      let followUpInstruction = 'Por favor, continúa con el análisis basado en la información proporcionada por el usuario, sin pedir información que ya te ha dado.';

      if (hasImagesInContext) {
        followUpInstruction = 'IMPORTANTE: Basándote en la imagen que analizaste anteriormente, continúa con el análisis. SIEMPRE haz referencia específica a lo que observaste en la imagen (opacidad, color, tamaño, etc.) antes de dar cualquier recomendación. Menciona la consulta veterinaria SOLO UNA VEZ al final del mensaje. No pidas información que ya te ha dado.';
      }

      // Incluir el contexto de análisis de imagen si existe
      const fullContext = imageAnalysisContext ?
        `${contextString}${imageAnalysisContext}` :
        contextString;

      languagePrompt = `${languagePrompt}\n\n=== CONTEXTO DE LA CONVERSACIÓN ANTERIOR ===\n${fullContext}\n\n=== RESPUESTA ACTUAL DEL USUARIO ===\n${message}\n\n${followUpInstruction}`;
    }

    const result = await chat.sendMessage(languagePrompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('❌ Error en sendTextMessage:', error);
    return `Lo siento, estoy teniendo problemas para procesar tu mensaje. Por favor intenta de nuevo en unos momentos.`;
  }
};

// Función para enviar mensaje con imagen
export const sendImageMessage = async (chat, message, imageData, currentLanguage = 'es', chatHistory = []) => {
  try {
    console.log('🖼️ INICIO sendImageMessage');
    console.log('📝 Mensaje:', message);
    console.log('🖼️ Imagen proporcionada:', !!imageData);
    console.log('🌍 Idioma:', currentLanguage);

    // Limpiar datos de imagen
    const cleanImage = cleanImageData(imageData);

    // Detectar si se necesita análisis especializado
    const analysisType = detectSpecializedAnalysis(message, true, chatHistory);
    console.log('🔍 Tipo de análisis detectado:', analysisType);

    // Sistema de prediagnósticos simplificado
    if (analysisType === 'skin') {
      console.log('🔬 Ejecutando prediagnóstico de piel...');
      return await handleSpecializedSkinAnalysis(cleanImage, message, currentLanguage);
    } else if (analysisType === 'ocular') {
      console.log('👁️ Ejecutando prediagnóstico ocular...');
      return await handleOcularConditionAnalysis(cleanImage, message, currentLanguage);
    } else if (analysisType === 'obesity') {
      console.log('📊 Ejecutando prediagnóstico de condición corporal...');
      return await handleBodyConditionAnalysis(cleanImage, message);
    } else if (analysisType === 'dysplasia') {
      console.log('🦴 Ejecutando prediagnóstico de postura...');
      return await handleDysplasiaPostureAnalysis(cleanImage, message);
    }

    console.log('🤖 Ejecutando análisis general con Gemini...');
    // Análisis general con Gemini
    // === NUEVO SISTEMA DE DETECCIÓN AUTOMÁTICA DE IDIOMAS ===
    const languagePrompt = getSystemPrompt(message, currentLanguage);

    const result = await chat.sendMessage([languagePrompt, { inlineData: { data: cleanImage, mimeType: "image/jpeg" } }]);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('❌ Error en sendImageMessage:', error);
    console.error('❌ Stack trace:', error.stack);

    // Mensaje de error más útil
    return `Lo siento, no pude analizar esta imagen en este momento. Por favor intenta de nuevo en unos momentos o comparte una imagen con mejor calidad.`;
  }
};

// Función para enviar mensaje con video
export const sendVideoMessage = async (chat, message, videoData) => {
  try {
    console.log('🎥 INICIO sendVideoMessage');
    const result = await chat.sendMessage([message, { inlineData: { data: videoData, mimeType: "video/mp4" } }]);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('❌ Error en sendVideoMessage:', error);
    return `Lo siento, no pude analizar este video en este momento. Por favor intenta de nuevo en unos momentos o comparte un video con mejor calidad.`;
  }
};

// Función para enviar mensaje con audio
export const sendAudioMessage = async (chat, message, audioData) => {
  try {
    console.log('🎵 INICIO sendAudioMessage');
    const result = await chat.sendMessage([message, { inlineData: { data: audioData, mimeType: "audio/wav" } }]);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('❌ Error en sendAudioMessage:', error);
    return `Lo siento, no pude analizar este audio en este momento. Por favor intenta de nuevo en unos momentos o comparte un audio con mejor calidad.`;
  }
};

// Función para análisis especializado de piel
export const handleSpecializedSkinAnalysis = async (imageData, message = '', currentLanguage = 'es') => {
  console.log('🔬 Iniciando análisis especializado de piel...');

  try {
    // Limpiar datos de imagen
    const cleanImage = cleanImageData(imageData);

    const prompt = `Eres un veterinario dermatólogo experto. Analiza esta imagen de una lesión cutánea en una mascota y proporciona un PREDIAGNÓSTICO veterinario real.

**INSTRUCCIONES CRÍTICAS:**
- Analiza REALMENTE la imagen que se te proporciona
- NO uses placeholders ni texto genérico
- Describe específicamente lo que ves en la imagen
- Genera un prediagnóstico basado en lo que observas
- Sé conciso y directo

**ANÁLISIS REQUERIDO:**
1. Descripción específica de la lesión visible
2. Características de la lesión (tamaño, color, forma, bordes)
3. Posibles diagnósticos diferenciales
4. Evaluación de urgencia
5. Recomendaciones inmediatas

**CONTEXTO:** ${message || 'Sin contexto adicional'}

**FORMATO DE RESPUESTA:**
🔍 **ANÁLISIS VISUAL:**
[Describe específicamente lo que ves en la imagen]

📊 **PREDIAGNÓSTICO:**
[Condición específica detectada con nivel de confianza]

⚠️ **SIGNOS IDENTIFICADOS:**
[Lista de signos específicos observados]

⚡ **RECOMENDACIONES:**
1. [Recomendación específica]
2. [Recomendación específica]

🏥 **CONSULTA VETERINARIA:**
[Cuándo y por qué consultar]

Responde en español de manera concisa y profesional.`;

    const result = await model.generateContent([prompt, { inlineData: { data: cleanImage, mimeType: "image/jpeg" } }]);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('❌ Error en análisis de piel:', error);
    return `Lo siento, no pude analizar esta imagen de piel en este momento. Por favor intenta de nuevo en unos momentos o comparte una imagen con mejor calidad.`;
  }
};

// === SISTEMA DE MÉDICO JEFE (GEMINI) ===

// Función para análisis general con Gemini (Médico Jefe)
const analyzeWithGemini = async (imageData, message = '', specialistContext = null, currentLanguage = 'es') => {
  try {
    console.log('🔍 Iniciando analyzeWithGemini...');
    console.log('🖼️ Imagen proporcionada:', !!imageData);
    console.log('📝 Mensaje:', message);
    console.log('👨‍⚕️ Contexto del especialista:', !!specialistContext);

    // Limpiar datos de imagen
    const cleanImage = cleanImageData(imageData);
    console.log('🔄 Imagen limpiada');

    // Usar el system prompt centralizado
    const basePrompt = getSystemPrompt(message, currentLanguage);

    let specializedPrompt = '';

    // Construir prompt basado en si hay contexto de especialista
    if (specialistContext && specialistContext.specialistAvailable) {
      specializedPrompt = `${basePrompt}

Eres un veterinario jefe experto. Un especialista ha analizado esta imagen y te ha proporcionado su reporte:

**REPORTE DEL ESPECIALISTA:**
${specialistContext.specialistReport}
Confianza del especialista: ${specialistContext.confidence}%

**TUS TAREAS:**
1. Analiza la imagen completa desde tu perspectiva de veterinario jefe
2. Evalúa y valida los hallazgos del especialista
3. Considera otros aspectos veterinarios que el especialista podría haber pasado por alto
4. Proporciona una evaluación final unificada
5. Da recomendaciones finales considerando ambos análisis

**CONTEXTO DEL PACIENTE:** ${message || 'Sin contexto adicional'}

**FORMATO DE RESPUESTA EXACTO:**
📊 INTERPRETACIÓN DEL ANÁLISIS:
[Resumen del análisis con porcentaje de confianza y condición específica]

🔍 Estadio de progresión (por describir):
[Descripción de estadios: Incipiente, Inmaduro, Maduro, Hipermaduro]

👁 Impacto en la visión:
Actual: [Descripción del impacto actual]
Futuro: [Descripción del impacto futuro]

⚡ RECOMENDACIONES INMEDIATAS:
1. [Recomendación 1]
2. [Recomendación 2]
3. [Recomendación 3]

📅 PLAN A LARGO PLAZO:
Tratamiento médico: [Descripción]
Tratamiento quirúrgico: [Descripción]
Cuidados diarios:
[Descripción de cuidados]

⚠️ Factores de riesgo:
[Factores de riesgo específicos]

🏠 Adaptaciones del hogar:
[Adaptaciones necesarias]

🚨 CUÁNDO BUSCAR AYUDA URGENTE:
[Síntomas de emergencia]

💡 Nota clave: [Información importante adicional]

**DESCRIPCIÓN DE LA IMAGEN:**
[Descripción detallada de lo que se observa en la imagen]

**Signos de problemas oculares:**
[Descripción de signos específicos]

**Recomendaciones de evaluación:**
* **Examen de la agudeza visual:** [Descripción]
* **Oftalmotoscopía:** [Descripción]
* **Biomicroscopía:** [Descripción]
* **Tonometría:** [Descripción]`;
    } else {
      // Análisis general sin especialista
      specializedPrompt = `${basePrompt}

Eres un veterinario experto. Analiza esta imagen de una mascota y proporciona:

**ANÁLISIS REQUERIDO:**
1. Evaluación general de la salud visible
2. Detección de posibles condiciones médicas
3. Análisis de comportamiento/estado general
4. Recomendaciones veterinarias

**CONTEXTO:** ${message || 'Sin contexto adicional'}

**FORMATO DE RESPUESTA EXACTO:**
📊 INTERPRETACIÓN DEL ANÁLISIS:
[Resumen del análisis con porcentaje de confianza y condición específica]

🔍 Estadio de progresión (por describir):
[Descripción de estadios relevantes]

👁 Impacto en la salud:
Actual: [Descripción del impacto actual]
Futuro: [Descripción del impacto futuro]

⚡ RECOMENDACIONES INMEDIATAS:
1. [Recomendación 1]
2. [Recomendación 2]
3. [Recomendación 3]

📅 PLAN A LARGO PLAZO:
Tratamiento médico: [Descripción]
Tratamiento quirúrgico: [Descripción]
Cuidados diarios:
[Descripción de cuidados]

⚠️ Factores de riesgo:
[Factores de riesgo específicos]

🏠 Adaptaciones del hogar:
[Adaptaciones necesarias]

🚨 CUÁNDO BUSCAR AYUDA URGENTE:
[Síntomas de emergencia]

💡 Nota clave: [Información importante adicional]

**DESCRIPCIÓN DE LA IMAGEN:**
[Descripción detallada de lo que se observa en la imagen]

**Signos de problemas:**
[Descripción de signos específicos]

**Recomendaciones de evaluación:**
* **Examen físico completo:** [Descripción]
* **Análisis de laboratorio:** [Descripción]
* **Imágenes diagnósticas:** [Descripción]`;
    }

    console.log('📝 Enviando prompt a Gemini...');
    const result = await model.generateContent([specializedPrompt, { inlineData: { data: cleanImage, mimeType: "image/jpeg" } }]);
    const response = await result.response;
    console.log('✅ Respuesta de Gemini recibida');

    return response.text();
  } catch (error) {
    console.error('❌ Error en analyzeWithGemini:', error);
    console.error('❌ Stack trace:', error.stack);
    throw error;
  }
};

// === SISTEMA DE ANÁLISIS INTEGRADO (ESPECIALISTA + MÉDICO JEFE) ===

// Función para análisis de obesidad con Gemini
export const handleObesityAnalysis = async (imageData, message = '', currentLanguage = 'es') => {
  console.log('🏥 Iniciando análisis de obesidad...');
  console.log('📝 Mensaje del usuario:', message);
  console.log('🖼️ Imagen proporcionada:', !!imageData);

  try {
    // Limpiar datos de imagen
    const cleanImage = cleanImageData(imageData);

    console.log('🔍 Analizando imagen con Gemini (con reintentos automáticos)...');
    const analysis = await analyzeWithGeminiWithRetries(cleanImage, message, '', currentLanguage);
    console.log('✅ Análisis completado exitosamente');

    return analysis;
  } catch (error) {
    console.error('❌ Error en análisis de obesidad:', error);
    console.error('❌ Stack trace:', error.stack);
    throw new Error('No se pudo completar el análisis. Por favor, intenta más tarde.');
  }
};

// Función para análisis de cataratas con Gemini
export const handleCataractsAnalysis = async (imageData, message = '', currentLanguage = 'es') => {
  console.log('🏥 Iniciando análisis de cataratas...');
  console.log('📝 Mensaje del usuario:', message);
  console.log('🖼️ Imagen proporcionada:', !!imageData);

  try {
    // Limpiar datos de imagen
    const cleanImage = cleanImageData(imageData);

    console.log('🔍 Analizando imagen con Gemini (con reintentos automáticos)...');
    const analysis = await analyzeWithGeminiWithRetries(cleanImage, message, '', currentLanguage);
    console.log('✅ Análisis completado exitosamente');

    return analysis;
  } catch (error) {
    console.error('❌ Error en análisis de cataratas:', error);
    console.error('❌ Stack trace:', error.stack);
    throw new Error('No se pudo completar el análisis. Por favor, intenta más tarde.');
  }
};

// Función para análisis de displasia con Gemini
export const handleDysplasiaAnalysis = async (imageData, message = '', currentLanguage = 'es') => {
  console.log('🏥 Iniciando análisis de displasia...');
  console.log('📝 Mensaje del usuario:', message);
  console.log('🖼️ Imagen proporcionada:', !!imageData);

  try {
    // Limpiar datos de imagen
    const cleanImage = cleanImageData(imageData);

    console.log('🔍 Analizando imagen con Gemini (con reintentos automáticos)...');
    const analysis = await analyzeWithGeminiWithRetries(cleanImage, message, '', currentLanguage);
    console.log('✅ Análisis completado exitosamente');

    return analysis;
  } catch (error) {
    console.error('❌ Error en análisis de displasia:', error);
    console.error('❌ Stack trace:', error.stack);
    throw new Error('No se pudo completar el análisis. Por favor, intenta más tarde.');
  }
};

// Función para análisis automático con Gemini
export const handleAutoAnalysis = async (imageData, message = '', currentLanguage = 'es') => {
  console.log('🏥 Iniciando análisis automático...');

  try {
    const cleanImage = cleanImageData(imageData);
    const analysis = await analyzeWithGeminiWithRetries(cleanImage, message, '', currentLanguage);
    console.log('✅ Análisis automático completado exitosamente');

    return analysis;
  } catch (error) {
    console.error('❌ Error en análisis automático:', error);
    throw new Error('No se pudo completar el análisis. Por favor, intenta más tarde.');
  }
};

// === SISTEMA DE RESPUESTA UNIFICADA ===

// Función para formatear respuesta unificada
const formatUnifiedResponse = (specialistContext, chiefDoctorAnalysis, analysisType, language = 'es') => {
  const isSpanish = language === 'es';

  let response = '';

  // Encabezado del análisis
  response += `🏥 **ANÁLISIS VETERINARIO INTEGRADO**\n\n`;

  // Sección del especialista
  if (specialistContext.specialistAvailable) {
    response += `🔍 **REPORTE DEL ESPECIALISTA EN ${analysisType.toUpperCase()}**\n`;
    response += `${specialistContext.specialistReport}\n`;
    response += `📊 Confianza del especialista: ${specialistContext.confidence}%\n\n`;

    if (specialistContext.recommendations.length > 0) {
      response += `💡 **Recomendaciones del especialista:**\n`;
      specialistContext.recommendations.forEach(rec => {
        response += `• ${rec}\n`;
      });
      response += `\n`;
    }
  } else {
    response += `⚠️ **Especialista no disponible**\n`;
    response += `${specialistContext.message}\n\n`;
  }

  // Separador
  response += `---\n\n`;

  // Análisis del Médico Jefe con el nuevo formato estructurado
  response += `👨‍⚕️ **EVALUACIÓN DEL MÉDICO JEFE**\n\n`;

  // Aplicar el formato de prediagnóstico estructurado
  if (analysisType === 'obesity') {
    response += `📊 INTERPRETACIÓN DEL ANÁLISIS:
El análisis indica una alta probabilidad (87%) de condición corporal alterada, específicamente sobrepeso u obesidad. Esta condición puede afectar significativamente la calidad de vida y longevidad de la mascota.

🔍 Estadio de progresión:
Posible estadio: Moderado (sobrepeso evidente con distribución de grasa visible pero sin limitaciones severas de movilidad).

👁 Impacto en la salud:
Actual: Dificultad para actividades físicas, mayor esfuerzo respiratorio, posible dolor articular.

Futuro (sin tratamiento): Puede evolucionar a obesidad severa con diabetes, problemas cardíacos y artritis.

⚡ RECOMENDACIONES INMEDIATAS:
1. Consulta veterinaria urgente para evaluación nutricional completa y plan de pérdida de peso.
2. Control de porciones: Implementa horarios de alimentación estrictos y mide las raciones.
3. Ejercicio gradual: Inicia con caminatas cortas y aumenta progresivamente la intensidad.
4. Elimina premios calóricos: Reemplaza con alternativas saludables como zanahorias o manzanas.

📅 PLAN A LARGO PLAZO:
Tratamiento médico: Dieta específica para pérdida de peso bajo supervisión veterinaria.

Tratamiento de ejercicio: Programa de actividad física gradual y supervisada.

Monitoreo mensual: Pesaje regular y ajuste del plan según progreso.

⚠️ FACTORES DE RIESGO:
Edad avanzada, esterilización, sedentarismo, alimentación ad libitum, razas propensas (Labrador, Beagle).

🏠 ADAPTACIONES DEL HOGAR:
Elimina acceso libre a comida.

Implementa ejercicios mentales (puzzles de comida).

Usa escaleras para perros para subir a muebles.

🚨 CUÁNDO BUSCAR AYUDA URGENTE:
Si la mascota muestra:

Dificultad respiratoria severa.

Incapacidad para moverse o levantarse.

Pérdida de apetito repentina.

💡 ¿Cirugía? Considerarla cuando:
La obesidad es extrema y afecta la movilidad.

Hay complicaciones médicas asociadas.

${chiefDoctorAnalysis}\n\n`;
  } else if (analysisType === 'cataracts') {
    response += `📊 INTERPRETACIÓN DEL ANÁLISIS:
El análisis indica una alta probabilidad (91%) de enfermedad ocular, específicamente Cataratas, con severidad significativa. Las cataratas consisten en la opacificación del cristalino, lo que puede progresar hasta causar ceguera si no se maneja adecuadamente.

🔍 Estadio de progresión:
Posible estadio: Inmaduro (opacidad parcial que comienza a afectar la visión, pero el perro aún conserva algo de capacidad visual).

👁 Impacto visual:
Actual: Visión borrosa, dificultad en ambientes con poca luz o cambios de superficie.

Futuro (sin tratamiento): Puede evolucionar a maduro/hipermaduro (pérdida total de visión en el ojo afectado).

⚡ RECOMENDACIONES INMEDIATAS:
1. Consulta veterinaria urgente con un oftalmólogo canino para confirmar el diagnóstico y evaluar posibles causas subyacentes (ej. diabetes).
2. Protege los ojos: Evita traumatismos (usar collar isabelino si hay rascado).
3. Limpieza ocular diaria: Usa suero fisiológico o toallitas oftálmicas específicas para perros.
4. Control de factores agravantes: Si hay diabetes, prioriza el manejo de glucosa.

📅 PLAN A LARGO PLAZO:
Tratamiento médico: Gotas antioxidantes (ej. Ocu-GLO®) pueden ralentizar la progresión, pero no eliminan las cataratas.

Tratamiento quirúrgico: La facocérmulsión (cirugía) es la única opción curativa. Ideal en estadios inmaduros, antes de complicaciones (uveítis, glaucoma).

Monitoreo trimestral: Para detectar cambios en la opacidad o presión intraocular.

⚠️ FACTORES DE RIESGO:
Edad (>7 años), genética (razas como Cocker Spaniel, Caniche), diabetes mellitus, traumatismos oculares.

🏠 ADAPTACIONES DEL HOGAR:
Mantén los muebles en lugares fijos.

Usa texturas bajo patas (alfombras) para guiarlo.

Evita escaleras sin supervisión.

🚨 CUÁNDO BUSCAR AYUDA URGENTE:
Si el perro muestra:

Dolor ocular (entrecerrar ojos, lagrimeo excesivo).

Enrojecimiento o turbidez repentina.

Tropezones frecuentes o desorientación severa.

💡 ¿Cirugía? Considerarla cuando:
La visión se deteriora rápidamente.

El perro es candidato (buena salud general, sin retinopatía avanzada).

${chiefDoctorAnalysis}\n\n`;
  } else if (analysisType === 'dysplasia') {
    response += `📊 INTERPRETACIÓN DEL ANÁLISIS:
El análisis indica una alta probabilidad (83%) de problema ortopédico, específicamente posible displasia de cadera o artritis. Esta condición puede afectar significativamente la movilidad y calidad de vida de la mascota.

🔍 Estadio de progresión:
Posible estadio: Moderado (signos evidentes de dolor o cojera pero sin limitaciones severas de movilidad).

👁 Impacto en la movilidad:
Actual: Dificultad para subir escaleras, cojera intermitente, posible dolor al levantarse.

Futuro (sin tratamiento): Puede evolucionar a artritis severa con pérdida de masa muscular y movilidad limitada.

⚡ RECOMENDACIONES INMEDIATAS:
1. Consulta veterinaria urgente con un ortopedista para evaluación completa y radiografías.
2. Control del dolor: Implementa reposo relativo y evita actividades que agraven el dolor.
3. Suplementos articulares: Considera glucosamina y condroitina bajo supervisión veterinaria.
4. Control de peso: Mantén un peso óptimo para reducir carga en las articulaciones.

📅 PLAN A LARGO PLAZO:
Tratamiento médico: Antiinflamatorios y analgésicos según prescripción veterinaria.

Tratamiento quirúrgico: Dependerá del diagnóstico definitivo (artroplastia, osteotomía).

Fisioterapia: Ejercicios de fortalecimiento muscular y terapia física.

⚠️ FACTORES DE RIESGO:
Edad avanzada, razas grandes (Pastor Alemán, Labrador), obesidad, actividad física excesiva en cachorros.

🏠 ADAPTACIONES DEL HOGAR:
Instala rampas para subir a muebles.

Usa camas ortopédicas con soporte adecuado.

Evita superficies resbaladizas (usa alfombras).

🚨 CUÁNDO BUSCAR AYUDA URGENTE:
Si la mascota muestra:

Dolor severo que no mejora con reposo.

Incapacidad para levantarse o caminar.

Pérdida de apetito o cambios de comportamiento.

💡 ¿Cirugía? Considerarla cuando:
El dolor es refractario al tratamiento médico.

Hay evidencia radiográfica de displasia severa.

${chiefDoctorAnalysis}\n\n`;
  } else {
    response += `${chiefDoctorAnalysis}\n\n`;
  }

  // Pie de página
  response += `📋 **NOTA IMPORTANTE:** Este análisis es preliminar. Siempre consulta con un veterinario profesional para diagnóstico y tratamiento.`;

  return response;
};

// === SISTEMA DE DETECCIÓN DE ANÁLISIS ESPECIALIZADO ===

// Función para detectar si se necesita análisis especializado
const detectSpecializedAnalysis = (message, hasImage = false, chatHistory = []) => {
  if (!hasImage) return null;

  const messageLower = message.toLowerCase();
  const recentMessages = chatHistory.slice(-3).map(msg => msg.content.toLowerCase()).join(' ');
  const fullContext = messageLower + ' ' + recentMessages;

  // Detección de análisis de piel (lesiones, heridas, problemas cutáneos)
  const skinKeywords = [
    'lesión', 'lesion', 'herida', 'wound', 'piel', 'skin', 'callo', 'callus',
    'úlcera', 'ulcer', 'erupción', 'eruption', 'rash', 'sarpullido',
    'alergia', 'allergy', 'picazón', 'itching', 'prurito', 'pruritus',
    'mancha', 'spot', 'bulto', 'lump', 'masa', 'mass', 'tumor', 'tumour',
    'verruga', 'wart', 'melanoma', 'cáncer', 'cancer', 'dermatitis'
  ];

  // Detección de análisis corporal (obesidad, peso, condición corporal)
  const bodyKeywords = [
    'peso', 'obeso', 'obesidad', 'sobrepeso', 'gordo', 'gorda', 'flaco', 'flaca', 'delgado',
    'weight', 'obese', 'obesity', 'overweight', 'fat', 'thin', 'skinny', 'body condition',
    'condición corporal', 'condicion corporal', 'body', 'cuerpo', 'grasa', 'fat',
    'chubby', 'gordito', 'gordita', 'muy gordo', 'muy gorda', 'muy flaco', 'muy flaca'
  ];

  // Detección de análisis de displasia (postura, cojera, articulaciones)
  const dysplasiaKeywords = [
    'displasia', 'cojera', 'cojea', 'cojeo', 'articulación', 'articulacion', 'cadera',
    'dysplasia', 'limp', 'limping', 'joint', 'hip', 'knee', 'elbow', 'arthritis',
    'artritis', 'dolor en la pata', 'dolor en las patas', 'pierna', 'piernas',
    'leg', 'legs', 'postura', 'posture', 'caminar', 'walking', 'movimiento',
    'movement', 'rigidez', 'stiffness', 'dificultad para caminar', 'difficulty walking'
  ];

  // Detección de análisis ocular (cataratas, ojos, vista)
  const eyeKeywords = [
    'catarata', 'cataratas', 'ojo', 'ojos', 'vista', 'visión', 'vision', 'ceguera',
    'cataract', 'eye', 'eyes', 'blind', 'blindness', 'cloudy', 'nublado',
    'pupila', 'pupil', 'iris', 'retina', 'córnea', 'cornea', 'glaucoma',
    'problema de vista', 'problema de ojos', 'eye problem', 'vision problem',
    'mi perrito tiene así su ojo', 'my dog has an eye like this'
  ];

  // Verificar coincidencias con prioridad
  const hasSkinKeywords = skinKeywords.some(keyword => fullContext.includes(keyword));
  const hasBodyKeywords = bodyKeywords.some(keyword => fullContext.includes(keyword));
  const hasDysplasiaKeywords = dysplasiaKeywords.some(keyword => fullContext.includes(keyword));
  const hasEyeKeywords = eyeKeywords.some(keyword => fullContext.includes(keyword));

  // Determinar tipo de análisis con prioridad específica
  // Priorizar palabras más específicas sobre generales
  if (hasEyeKeywords) {
    // Verificar si hay palabras específicas de ojos
    const specificEyeKeywords = ['catarata', 'cataratas', 'cataract', 'ojo', 'ojos', 'eye', 'eyes'];
    const hasSpecificEyeKeywords = specificEyeKeywords.some(keyword => fullContext.includes(keyword));
    if (hasSpecificEyeKeywords) {
      console.log('🔍 DEBUG - Análisis ocular detectado:', fullContext);
      return 'ocular';
    }
  }

  if (hasSkinKeywords) {
    console.log('🔍 DEBUG - Análisis de piel detectado:', fullContext);
    return 'skin';
  } else if (hasBodyKeywords) {
    console.log('🔍 DEBUG - Análisis de obesidad detectado:', fullContext);
    return 'obesity';
  } else if (hasDysplasiaKeywords) {
    console.log('🔍 DEBUG - Análisis de displasia detectado:', fullContext);
    return 'dysplasia';
  } else if (hasEyeKeywords) {
    console.log('🔍 DEBUG - Análisis ocular detectado (fallback):', fullContext);
    return 'ocular';
  }

  return null;
};

// === FUNCIONES DE COMPATIBILIDAD (MANTENER FORMATO EXISTENTE) ===

// Función para análisis de condición corporal (mantener compatibilidad)
export const handleBodyConditionAnalysis = async (imageData, message = '') => {
  console.log('📊 Análisis de condición corporal iniciado...');

  try {
    // Limpiar datos de imagen
    const cleanImage = cleanImageData(imageData);

    const prompt = `Eres un veterinario experto en nutrición y condición corporal. Analiza esta imagen de una mascota y proporciona un PREDIAGNÓSTICO veterinario real.

**INSTRUCCIONES CRÍTICAS:**
- Analiza REALMENTE la imagen que se te proporciona
- NO uses placeholders ni texto genérico
- Describe específicamente lo que ves en la imagen
- Genera un prediagnóstico basado en lo que observas
- Sé conciso y directo

**ANÁLISIS REQUERIDO:**
1. Condición corporal específica (delgado, normal, sobrepeso, obeso)
2. Masa muscular visible
3. Distribución de grasa
4. Postura y estructura general
5. Signos de desnutrición o sobrealimentación

**CONTEXTO:** ${message || 'Sin contexto adicional'}

**FORMATO DE RESPUESTA:**
🔍 **ANÁLISIS VISUAL:**
[Describe específicamente lo que ves en la imagen]

📊 **PREDIAGNÓSTICO:**
[Condición específica detectada con nivel de confianza]

⚠️ **SIGNOS IDENTIFICADOS:**
[Lista de signos específicos observados]

⚡ **RECOMENDACIONES:**
1. [Recomendación específica]
2. [Recomendación específica]

🏥 **CONSULTA VETERINARIA:**
[Cuándo y por qué consultar]

Responde en español de manera concisa y profesional.`;

    const result = await model.generateContent([prompt, { inlineData: { data: cleanImage, mimeType: "image/jpeg" } }]);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('❌ Error en análisis de condición corporal:', error);
    return `Lo siento, no pude analizar la condición corporal en este momento. Por favor intenta de nuevo en unos momentos o comparte una imagen con mejor calidad.`;
  }
};

// Función para análisis de displasia (mantener compatibilidad)
export const handleDysplasiaPostureAnalysis = async (imageData, message = '') => {
  console.log('🦴 Análisis de postura para displasia iniciado...');

  try {
    // Limpiar datos de imagen
    const cleanImage = cleanImageData(imageData);

    const prompt = `Eres un veterinario ortopédico experto. Analiza esta imagen de una mascota y proporciona un PREDIAGNÓSTICO veterinario real.

**INSTRUCCIONES CRÍTICAS:**
- Analiza REALMENTE la imagen que se te proporciona
- NO uses placeholders ni texto genérico
- Describe específicamente lo que ves en la imagen
- Genera un prediagnóstico basado en lo que observas
- Sé conciso y directo

**ANÁLISIS REQUERIDO:**
1. Postura y alineación de extremidades
2. Signos de cojera o dolor
3. Estructura de cadera y articulaciones
4. Movimiento y equilibrio
5. Signos de displasia o artritis

**CONTEXTO:** ${message || 'Sin contexto adicional'}

**FORMATO DE RESPUESTA:**
🔍 **ANÁLISIS VISUAL:**
[Describe específicamente lo que ves en la imagen]

📊 **PREDIAGNÓSTICO:**
[Condición específica detectada con nivel de confianza]

⚠️ **SIGNOS IDENTIFICADOS:**
[Lista de signos específicos observados]

⚡ **RECOMENDACIONES:**
1. [Recomendación específica]
2. [Recomendación específica]

🏥 **CONSULTA VETERINARIA:**
[Cuándo y por qué consultar]

Responde en español de manera concisa y profesional.`;

    const result = await model.generateContent([prompt, { inlineData: { data: cleanImage, mimeType: "image/jpeg" } }]);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('❌ Error en análisis de postura:', error);
    return `Lo siento, no pude analizar la postura en este momento. Por favor intenta de nuevo en unos momentos o comparte una imagen con mejor calidad.`;
  }
};

// Función para análisis de condición ocular (mantener compatibilidad)
export const handleOcularConditionAnalysis = async (imageData, message = '', currentLanguage = 'es') => {
  console.log('👁️ Análisis de condición ocular iniciado...');

  try {
    // Limpiar datos de imagen
    const cleanImage = cleanImageData(imageData);

    const prompt = `Eres un veterinario oftalmólogo experto. Analiza esta imagen de una mascota y proporciona un PREDIAGNÓSTICO veterinario real.

**INSTRUCCIONES CRÍTICAS:**
- Analiza REALMENTE la imagen que se te proporciona
- NO uses placeholders ni texto genérico
- Describe específicamente lo que ves en la imagen
- Genera un prediagnóstico basado en lo que observas
- Sé conciso y directo

**ANÁLISIS REQUERIDO:**
1. Descripción específica de lo que observas en los ojos
2. Signos visibles de problemas oculares
3. Evaluación de la claridad corneal
4. Estado de la pupila y conjuntiva
5. Cualquier anomalía visible

**CONTEXTO:** ${message || 'Sin contexto adicional'}

**FORMATO DE RESPUESTA:**
🔍 **ANÁLISIS VISUAL:**
[Describe específicamente lo que ves en la imagen]

📊 **PREDIAGNÓSTICO:**
[Condición específica detectada con nivel de confianza]

⚠️ **SIGNOS IDENTIFICADOS:**
[Lista de signos específicos observados]

⚡ **RECOMENDACIONES:**
1. [Recomendación específica]
2. [Recomendación específica]

🏥 **CONSULTA VETERINARIA:**
[Cuándo y por qué consultar]

Responde en español de manera concisa y profesional.`;

    const result = await model.generateContent([prompt, { inlineData: { data: cleanImage, mimeType: "image/jpeg" } }]);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('❌ Error en análisis ocular:', error);
    return `Lo siento, no pude analizar los ojos en este momento. Por favor intenta de nuevo en unos momentos o comparte una imagen con mejor calidad.`;
  }
};

// === FUNCIONES DE UTILIDAD ===



// === FUNCIÓN PARA ANÁLISIS CON REINTENTOS Y FALLBACK INTELIGENTE ===

// Función para analizar con Gemini con reintentos automáticos
const analyzeWithGeminiWithRetries = async (imageData, message, specialistContext, currentLanguage, maxRetries = 3) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 1) {
        console.log(`🔄 Reintentando análisis (intento ${attempt}/${maxRetries})...`);
      } else {
        console.log('🔍 Analizando imagen con Gemini...');
      }

      const result = await analyzeWithGemini(imageData, message, specialistContext, currentLanguage);
      console.log('✅ Análisis completado exitosamente');
      return result;
    } catch (error) {
      console.error(`❌ Error en intento ${attempt}:`, error.message);

      // Si es error de sobrecarga (503) y no es el último intento, esperar y reintentar
      if (error.message.includes('503') || error.message.includes('overloaded') || error.message.includes('overload')) {
        if (attempt < maxRetries) {
          const waitTime = attempt * 2000; // 2s, 4s, 6s
          console.log(`⏳ Gemini temporalmente sobrecargado, esperando ${waitTime / 1000}s antes del reintento...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        } else {
          throw new Error('Gemini está temporalmente sobrecargado. Por favor, intenta en unos minutos.');
        }
      }

      // Si no es error de sobrecarga, lanzar error inmediatamente
      throw error;
    }
  }
};



// === FUNCIONES DE UTILIDAD PARA FUNCTION CALLING ===

// Función para verificar si una respuesta es una llamada a función
export const isFunctionCall = (response) => {
  if (!response || typeof response !== 'string') return false;

  // Buscar patrones que indiquen una llamada a función
  const functionPatterns = [
    /function\s*\(/i,
    /func\s*\(/i,
    /call\s*\(/i,
    /execute\s*\(/i,
    /run\s*\(/i,
    /invoke\s*\(/i
  ];

  return functionPatterns.some(pattern => pattern.test(response));
};

// Función para extraer el nombre de la función de una respuesta
export const extractFunctionName = (response) => {
  if (!response || typeof response !== 'string') return null;

  // Buscar patrones de nombres de función
  const functionNamePatterns = [
    /function\s+(\w+)\s*\(/i,
    /func\s+(\w+)\s*\(/i,
    /call\s+(\w+)\s*\(/i,
    /execute\s+(\w+)\s*\(/i,
    /run\s+(\w+)\s*\(/i,
    /invoke\s+(\w+)\s*\(/i,
    /(\w+)\s*\(/i  // Patrón genérico para cualquier función
  ];

  for (const pattern of functionNamePatterns) {
    const match = response.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
};

// Función para verificar el estado de Roboflow
export const checkRoboflowStatus = () => {
  return {
    available: true,
    message: 'Roboflow está disponible'
  };
};

// === FUNCIÓN PARA GENERAR TÍTULOS DE CHAT ===
export const generateChatTitle = async (userMessage, language = 'es') => {
  try {
    console.log('🎯 Generando título para chat...');
    console.log('📝 Mensaje del usuario:', userMessage);
    console.log('🌍 Idioma:', language);

    // Prompt optimizado para generar títulos
    const titlePrompt = `Resume la siguiente consulta en un título de 2 a 8 palabras para un historial de chat. El título debe ser descriptivo y relevante.

Responde únicamente con el texto del título, sin comillas, sin puntuación adicional, sin explicaciones.

Consulta: "${userMessage}"

Título:`;

    // Usar el modelo de Gemini para generar el título
    const result = await model.generateContent(titlePrompt);
    const generatedTitle = result.response.text().trim();

    console.log('✅ Título generado:', generatedTitle);

    // Validar que el título no esté vacío y tenga un formato adecuado
    if (generatedTitle && generatedTitle.length > 0 && generatedTitle.length <= 50) {
      return generatedTitle;
    } else {
      throw new Error('Título generado inválido');
    }

  } catch (error) {
    console.warn('⚠️ Error generando título con Gemini:', error);

    // Fallback: generar título por defecto con fecha
    const today = new Date();
    const dateString = today.toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });

    const fallbackTitle = language === 'es'
      ? `Nueva Consulta ${dateString}`
      : `New Consultation ${dateString}`;

    console.log('🔄 Usando título por defecto:', fallbackTitle);
    return fallbackTitle;
  }
};

// === FUNCIÓN PARA DETECTAR SI ES PRIMERA CONVERSACIÓN ===
export const isFirstConversation = (currentChatId, messages) => {
  // Filtrar mensajes de bienvenida inicial
  const realMessages = messages.filter(msg =>
    msg.content !== 'initial_greeting' &&
    msg.content !== '¡Hola! Soy Pawnalytics, tu asistente de salud y cuidado para mascotas. ¿En qué puedo ayudarte hoy?' &&
    msg.content !== 'Hello! I\'m Pawnalytics, your health and pet care assistant. How can I help you today?'
  );

  // Crear chat automáticamente cuando:
  // 1. No hay chat activo (currentChatId es null)
  // 2. Hay mensajes reales del usuario (no solo bienvenida)
  // 3. Es el primer mensaje real de esta sesión
  return !currentChatId && realMessages.length === 1;
};