package expo.modules.systeminsets

import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Height of the phone's navigation buttons (or gesture bar) at the bottom of the screen, in dp.
// Phones with the 3 buttons (◁ ○ |||) need much more room than phones with a gesture bar.
class SystemInsetsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SystemInsets")

    Function("bottomInset") {
      val activity = appContext.currentActivity ?: return@Function 0.0
      val view = activity.window?.decorView ?: return@Function 0.0
      val insets = ViewCompat.getRootWindowInsets(view) ?: return@Function 0.0
      val bottom = insets.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom
      (bottom / view.resources.displayMetrics.density).toDouble()
    }
  }
}
