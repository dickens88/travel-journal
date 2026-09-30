package expo.modules.xhsshare

import android.content.ClipData
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

private const val XHS_PACKAGE = "com.xingin.xhs"

class XhsNotInstalledException : CodedException("ERR_XHS_NOT_INSTALLED", "Xiaohongshu is not installed", null)

class XhsShareModule : Module() {
  private val context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("XhsShare")

    Function("isInstalled") {
      context.packageManager.getLaunchIntentForPackage(XHS_PACKAGE) != null
    }

    // Hands the images straight to Xiaohongshu's post editor, in order
    Function("shareImages") { uris: List<String> ->
      // expo-sharing's FileProvider already exposes the cache dir that captureRef writes to
      val authority = context.packageName + ".SharingFileProvider"
      val contentUris = ArrayList(uris.map { FileProvider.getUriForFile(context, authority, File(Uri.parse(it).path!!)) })
      val intent = Intent(Intent.ACTION_SEND_MULTIPLE).apply {
        setPackage(XHS_PACKAGE)
        type = "image/*"
        putParcelableArrayListExtra(Intent.EXTRA_STREAM, contentUris)
        clipData = ClipData.newUri(context.contentResolver, "image", contentUris[0]).apply {
          contentUris.drop(1).forEach { addItem(ClipData.Item(it)) }
        }
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      if (intent.resolveActivity(context.packageManager) == null) throw XhsNotInstalledException()
      (appContext.currentActivity ?: context).startActivity(intent)
    }
  }
}
