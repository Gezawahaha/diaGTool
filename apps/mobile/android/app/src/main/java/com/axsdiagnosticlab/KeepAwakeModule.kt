package com.axsdiagnosticlab

import android.view.WindowManager
import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

/**
 * Keeps the screen on while the idle monitor runs. React Native pauses JS
 * timers when the activity is in the background, so an unattended monitor
 * needs the app to stay in the foreground with the screen on.
 */
class KeepAwakeModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = NAME

  @ReactMethod
  fun activate() = setFlag(true)

  @ReactMethod
  fun deactivate() = setFlag(false)

  private fun setFlag(on: Boolean) {
    UiThreadUtil.runOnUiThread {
      val window = reactApplicationContext.currentActivity?.window ?: return@runOnUiThread
      if (on) {
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
      } else {
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
      }
    }
  }

  companion object {
    const val NAME = "KeepAwake"
  }
}

class KeepAwakePackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
    if (name == KeepAwakeModule.NAME) KeepAwakeModule(reactContext) else null

  override fun getReactModuleInfoProvider() = ReactModuleInfoProvider {
    mapOf(
      KeepAwakeModule.NAME to
        ReactModuleInfo(KeepAwakeModule.NAME, KeepAwakeModule::class.java.name, false, false, false, false),
    )
  }
}
