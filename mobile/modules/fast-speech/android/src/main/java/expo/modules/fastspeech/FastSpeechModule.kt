package expo.modules.fastspeech

import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.Voice
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.Locale

// Speaks with the phone's voice (Android TextToSpeech) as fast as possible, for an AAC app where a
// tap must speak at once:
// - the voice engine is started when the app opens and kept open;
// - the list of voices is read once (reading it is slow on cheap phones);
// - the voice, language, speed and pitch are only changed when they differ from the last time;
// - each new text replaces the current one immediately (QUEUE_FLUSH), so no separate stop is needed.
class FastSpeechModule : Module() {
  private var tts: TextToSpeech? = null
  private var ready = false
  private var failed = false
  private var voicesByName: Map<String, Voice> = emptyMap()
  private var currentVoice: String? = null
  private var currentLanguage: String? = null
  private var currentRate: Float? = null
  private var currentPitch: Float? = null
  private var pending: Pending? = null
  private val pendingVoicePromises = mutableListOf<Promise>()

  private data class Pending(
    val id: String,
    val text: String,
    val voice: String?,
    val language: String?,
    val rate: Float,
    val pitch: Float,
    val retried: Boolean = false,
  )

  override fun definition() = ModuleDefinition {
    Name("FastSpeech")
    Events("onStart", "onDone", "onStop", "onError")

    OnCreate { synchronized(this@FastSpeechModule) { start() } }
    OnDestroy {
      tts?.shutdown()
      tts = null
    }

    // [{ identifier, language, networkRequired, notInstalled }]
    AsyncFunction("getVoices") { promise: Promise ->
      synchronized(this@FastSpeechModule) {
        when {
          ready -> promise.resolve(voiceList())
          failed -> promise.resolve(emptyList<Map<String, Any>>())
          else -> {
            pendingVoicePromises.add(promise)
            start()
          }
        }
      }
    }

    AsyncFunction("speak") { id: String, text: String, voice: String?, language: String?, rate: Double, pitch: Double ->
      synchronized(this@FastSpeechModule) {
        val request = Pending(id, text, voice, language, rate.toFloat(), pitch.toFloat())
        when {
          ready -> speakNow(request)
          // The engine failed to open last time: try opening it again for this text.
          failed -> restart(request)
          // Only the newest text waits for the engine to finish starting.
          else -> {
            pending = request
            start()
          }
        }
      }
    }

    // Checks that the phone's voice app is still connected and reconnects if Android closed it
    // (called when the app comes back to the screen, so the next tap speaks at once).
    AsyncFunction("ensureReady") {
      synchronized(this@FastSpeechModule) {
        val engine = tts
        when {
          engine == null || failed -> restart(null)
          // Asking the voice app for its voices returns nothing when the connection was lost.
          ready && (try { engine.voices } catch (_: Exception) { null }) == null -> restart(null)
        }
      }
      Unit
    }

    AsyncFunction("stop") {
      synchronized(this@FastSpeechModule) {
        pending = null
        tts?.stop()
      }
      Unit
    }
  }

  private fun start() {
    if (tts != null) return
    val context = appContext.reactContext ?: return
    var engine: TextToSpeech? = null
    engine = TextToSpeech(context) { status ->
      synchronized(this@FastSpeechModule) {
        // An engine that was replaced meanwhile (see restart) is ignored.
        if (tts !== engine) return@synchronized
        val request = pending
        pending = null
        if (status == TextToSpeech.SUCCESS) {
          ready = true
          tts?.setOnUtteranceProgressListener(listener)
          voicesByName = try {
            tts?.voices?.associateBy { it.name } ?: emptyMap()
          } catch (_: Exception) {
            emptyMap()
          }
          pendingVoicePromises.forEach { it.resolve(voiceList()) }
          request?.let { speakNow(it) }
        } else {
          failed = true
          request?.let { send("onError", it.id) }
          pendingVoicePromises.forEach { it.resolve(emptyList<Map<String, Any>>()) }
        }
        pendingVoicePromises.clear()
      }
    }
    tts = engine
  }

  private fun voiceList(): List<Map<String, Any>> = voicesByName.values.map { voice ->
    mapOf(
      "identifier" to voice.name,
      "language" to voice.locale.toLanguageTag(),
      "networkRequired" to voice.isNetworkConnectionRequired,
      "notInstalled" to (voice.features?.contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED) ?: false),
    )
  }

  // Android may close the phone's voice app in the background (to save memory). The connection is
  // then lost and every speak fails ("not bound to TTS engine"), so the voice engine is opened again
  // and the text spoken once it is ready. Tried once per text, so it can never loop.
  private fun restart(request: Pending?) {
    try {
      tts?.shutdown()
    } catch (_: Exception) {
    }
    tts = null
    ready = false
    failed = false
    currentVoice = null
    currentLanguage = null
    currentRate = null
    currentPitch = null
    pending = request?.copy(retried = true)
    start()
  }

  private fun speakNow(request: Pending) {
    val engine = tts
    if (engine == null) {
      pending = request
      start()
      return
    }
    val result = try {
      applySettings(engine, request)
      engine.speak(request.text, TextToSpeech.QUEUE_FLUSH, Bundle(), request.id)
    } catch (_: Exception) {
      TextToSpeech.ERROR
    }
    if (result == TextToSpeech.ERROR) {
      if (request.retried) send("onError", request.id) else restart(request)
    }
  }

  private fun applySettings(engine: TextToSpeech, request: Pending) {
    if (currentRate != request.rate) {
      engine.setSpeechRate(request.rate)
      currentRate = request.rate
    }
    if (currentPitch != request.pitch) {
      engine.setPitch(request.pitch)
      currentPitch = request.pitch
    }
    val voice = request.voice?.let { voicesByName[it] }
    if (voice != null) {
      if (currentVoice != voice.name) {
        engine.voice = voice
        currentVoice = voice.name
        currentLanguage = null
      }
    } else if (request.language != null && currentLanguage != request.language) {
      engine.language = Locale.forLanguageTag(request.language)
      currentLanguage = request.language
      currentVoice = null
    }
  }

  private val listener = object : UtteranceProgressListener() {
    override fun onStart(utteranceId: String) = send("onStart", utteranceId)
    override fun onDone(utteranceId: String) = send("onDone", utteranceId)
    override fun onStop(utteranceId: String, interrupted: Boolean) = send("onStop", utteranceId)
    @Deprecated("Deprecated in Android")
    override fun onError(utteranceId: String) = send("onError", utteranceId)
    override fun onError(utteranceId: String, errorCode: Int) = send("onError", utteranceId)
  }

  private fun send(event: String, id: String) {
    sendEvent(event, Bundle().apply { putString("id", id) })
  }
}
