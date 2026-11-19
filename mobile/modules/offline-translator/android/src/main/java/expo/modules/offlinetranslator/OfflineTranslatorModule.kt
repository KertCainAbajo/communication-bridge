package expo.modules.offlinetranslator

import com.google.mlkit.common.model.DownloadConditions
import com.google.mlkit.common.model.RemoteModelManager
import com.google.mlkit.nl.translate.TranslateLanguage
import com.google.mlkit.nl.translate.TranslateRemoteModel
import com.google.mlkit.nl.translate.Translation
import com.google.mlkit.nl.translate.Translator
import com.google.mlkit.nl.translate.TranslatorOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// On-device translation with Google ML Kit. Translating never uses the internet; only the one-time
// download of a language pack does. Languages are ML Kit codes: "en" (English), "tl" (Filipino/Tagalog).
class OfflineTranslatorModule : Module() {
  private val translators = mutableMapOf<String, Translator>()

  private fun languageOf(code: String): String =
    TranslateLanguage.fromLanguageTag(code) ?: throw IllegalArgumentException("Unsupported language: $code")

  private fun translatorFor(from: String, to: String): Translator =
    translators.getOrPut("$from>$to") {
      Translation.getClient(
        TranslatorOptions.Builder()
          .setSourceLanguage(languageOf(from))
          .setTargetLanguage(languageOf(to))
          .build()
      )
    }

  override fun definition() = ModuleDefinition {
    Name("OfflineTranslator")

    // True when the language packs for both languages are on the phone (translation works offline).
    AsyncFunction("isReady") { from: String, to: String, promise: Promise ->
      RemoteModelManager.getInstance()
        .getDownloadedModels(TranslateRemoteModel::class.java)
        .addOnSuccessListener { models ->
          val downloaded = models.map { it.language }.toSet()
          promise.resolve(listOf(languageOf(from), languageOf(to)).all { it == TranslateLanguage.ENGLISH || it in downloaded })
        }
        .addOnFailureListener { promise.resolve(false) }
    }

    // Downloads the language packs once (needs internet). wifiOnly protects users' mobile data.
    AsyncFunction("download") { from: String, to: String, wifiOnly: Boolean, promise: Promise ->
      val conditions = DownloadConditions.Builder().apply { if (wifiOnly) requireWifi() }.build()
      translatorFor(from, to).downloadModelIfNeeded(conditions)
        .addOnSuccessListener { promise.resolve(true) }
        .addOnFailureListener { error -> promise.reject("DOWNLOAD_FAILED", error.message ?: "Download failed", error) }
    }

    // Translates offline; fails if the language packs are not downloaded yet.
    AsyncFunction("translate") { text: String, from: String, to: String, promise: Promise ->
      translatorFor(from, to).translate(text)
        .addOnSuccessListener { promise.resolve(it) }
        .addOnFailureListener { error -> promise.reject("TRANSLATE_FAILED", error.message ?: "Translation failed", error) }
    }

    OnDestroy {
      translators.values.forEach { it.close() }
      translators.clear()
    }
  }
}
