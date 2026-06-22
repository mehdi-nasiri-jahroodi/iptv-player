package com.iptvtavern.androidtv

import android.os.Build
import android.util.Log
import com.iptvtavern.androidtv.BuildConfig
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * Crash reporter — saves crash reports to device storage and optionally
 * sends them to Telegram or any HTTP webhook.
 *
 * No library dependencies. Fire-and-forget background thread.
 *
 * ## Telegram setup (recommended — permanent, free, crash → chat message)
 * 1. Talk to @BotFather on Telegram → /newbot → copy token
 * 2. Start chat with your bot, send any message
 * 3. Visit https://api.telegram.org/bot<TOKEN>/getUpdates → copy chat.id
 * 4. Construct URL:
 *    https://api.telegram.org/bot<TOKEN>/sendMessage?chat_id=<CHAT_ID>&parse_mode=HTML
 * 5. Replace DEFAULT_WEBHOOK_URL below with that URL
 *
 * ## webhook.site (free, 7-day expiry)
 * 1. Visit https://webhook.site → copy your unique URL
 * 2. Replace DEFAULT_WEBHOOK_URL below
 *
 * ## Retrieve local crash files via ADB
 *   adb pull /data/data/com.iptvtavern.androidtv/files/crashes/
 */
object CrashReporter {
    private const val TAG = "CrashReporter"
    private const val MAX_CRASH_FILES = 20

    private val webhookUrl: String get() {
        val token = BuildConfig.TELEGRAM_BOT_TOKEN
        val chatId = BuildConfig.TELEGRAM_CHAT_ID
        return if (token.isNotEmpty() && chatId.isNotEmpty()) {
            "https://api.telegram.org/bot$token/sendMessage?chat_id=$chatId&parse_mode=HTML"
        } else ""
    }

    fun report(throwable: Throwable, appContext: android.content.Context, blocking: Boolean = false) {
        val task = Runnable {
            try {
                writeToFile(throwable, appContext)
                val url = webhookUrl
                if (url.isNotEmpty()) {
                    sendReport(throwable, appContext, url)
                } else {
                    Log.w(TAG, "Telegram webhook not configured (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID)")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to report crash", e)
            }
        }
        if (blocking) {
            task.run()
        } else {
            Thread(task, "CrashReporter").start()
        }
    }

    private fun sendReport(throwable: Throwable, context: android.content.Context, url: String) {
        try {
            val isTelegram = url.contains("api.telegram.org")
            if (isTelegram) {
                postToTelegram(throwable, context, url)
            } else {
                postToWebhook(throwable, context, url)
            }
        } catch (e: IOException) {
            Log.e(TAG, "Failed to send crash report", e)
        }
    }

    private fun postToTelegram(throwable: Throwable, context: android.content.Context, fullUrl: String) {
        val urlObj = URL(fullUrl)
        val query = urlObj.query ?: ""
        val params = query.split("&").associate {
            val parts = it.split("=", limit = 2)
            parts[0] to (parts.getOrNull(1) ?: "")
        }
        val chatId = params["chat_id"] ?: return
        val parseMode = params["parse_mode"] ?: "HTML"

        val apiUrl = "${urlObj.protocol}://${urlObj.host}/bot${urlObj.path.substringAfter("/bot")}"
            .substringBefore("/sendMessage") + "/sendMessage"

        val text = buildTelegramText(throwable, context, parseMode)

        val body = "chat_id=${URLEncoder.encode(chatId, "UTF-8")}" +
            "&parse_mode=${URLEncoder.encode(parseMode, "UTF-8")}" +
            "&text=${URLEncoder.encode(text, "UTF-8")}" +
            "&disable_web_page_preview=true"

        val conn = URL(apiUrl).openConnection() as HttpURLConnection
        conn.requestMethod = "POST"
        conn.setRequestProperty("Content-Type", "application/x-www-form-urlencoded")
        conn.doOutput = true
        conn.connectTimeout = 5000
        conn.readTimeout = 5000
        OutputStreamWriter(conn.outputStream).use { it.write(body) }
        val responseCode = conn.responseCode
        if (responseCode !in 200..299) {
            val errorBody = conn.errorStream?.bufferedReader()?.use { it.readText() }.orEmpty()
            Log.e(TAG, "Telegram send failed: HTTP $responseCode — $errorBody")
        } else {
            Log.d(TAG, "Crash sent to Telegram: HTTP $responseCode")
        }
        conn.disconnect()
    }

    private fun buildTelegramText(throwable: Throwable, context: android.content.Context, parseMode: String): String {
        val appInfo = context.packageManager.getPackageInfo(context.packageName, 0)
        val runtime = Runtime.getRuntime()
        val freeMb = runtime.freeMemory() / 1024 / 1024
        val maxMb = runtime.maxMemory() / 1024 / 1024

        val isHtml = parseMode.equals("HTML", ignoreCase = true)

        val header = if (isHtml) {
            "<b>IPTV Tavern Crash</b>\n" +
                "v${appInfo.versionName} • ${Build.MANUFACTURER} ${Build.MODEL} • Android ${Build.VERSION.RELEASE}\n" +
                "Memory: ${freeMb}MB free / ${maxMb}MB max\n"
        } else {
            "IPTV Tavern Crash\n" +
                "v${appInfo.versionName} • ${Build.MANUFACTURER} ${Build.MODEL} • Android ${Build.VERSION.RELEASE}\n" +
                "Memory: ${freeMb}MB free / ${maxMb}MB max\n"
        }

        val exceptionLine = if (isHtml) {
            "<b>${throwable.javaClass.name}</b>: ${throwable.message ?: "(no message)"}"
        } else {
            "${throwable.javaClass.name}: ${throwable.message ?: "(no message)"}"
        }

        val stackTrace = throwable.stackTraceToString()
            .take(3000) // Leave room for header

        val body = exceptionLine + "\n\n" + (if (isHtml) "<pre>$stackTrace</pre>" else stackTrace)

        return (header + body).take(4096) // Telegram limit
    }

    private fun writeToFile(throwable: Throwable, context: android.content.Context) {
        val crashDir = File(context.filesDir, "crashes")
        crashDir.mkdirs()

        val timestamp = Instant.now().atZone(ZoneId.systemDefault())
            .format(DateTimeFormatter.ofPattern("yyyyMMdd_HHmmss"))
        val file = File(crashDir, "crash_$timestamp.txt")
        file.writeText(buildTextReport(throwable, context))
        Log.d(TAG, "Crash saved: ${file.absolutePath}")

        // Rotate old files
        crashDir.listFiles()?.sortedBy { it.lastModified() }?.let { files ->
            val toDelete = files.dropLast(MAX_CRASH_FILES)
            toDelete.forEach { it.delete() }
        }
    }

    private fun postToWebhook(throwable: Throwable, context: android.content.Context, webhookUrl: String) {
        try {
            val json = buildJsonReport(throwable, context)
            val url = URL(webhookUrl)
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.setRequestProperty("Content-Type", "application/json")
            conn.doOutput = true
            conn.connectTimeout = 5000
            conn.readTimeout = 5000
            conn.outputStream.use { it.write(json.toByteArray()) }
            val responseCode = conn.responseCode
            Log.d(TAG, "Crash posted to webhook: HTTP $responseCode")
        } catch (e: IOException) {
            Log.e(TAG, "Failed to post crash to webhook", e)
        }
    }

    private fun buildJsonReport(throwable: Throwable, context: android.content.Context): String {
        val appInfo = context.packageManager.getPackageInfo(context.packageName, 0)
        return JSONObject().apply {
            put("app_version", appInfo.versionName ?: "unknown")
            put("app_version_code", if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                appInfo.longVersionCode
            } else {
                @Suppress("DEPRECATION")
                appInfo.versionCode
            })
            put("package", context.packageName)
            put("device", "${Build.MANUFACTURER} ${Build.MODEL}")
            put("android_version", Build.VERSION.RELEASE)
            put("android_sdk", Build.VERSION.SDK_INT)
            put("timestamp", Instant.now().toString())
            put("exception", throwable.javaClass.name)
            put("message", throwable.message ?: "(no message)")
            put("stack_trace", throwable.stackTraceToString())
            put("cause", throwable.cause?.let { cause ->
                JSONObject().apply {
                    put("exception", cause.javaClass.name)
                    put("message", cause.message ?: "(no message)")
                    put("stack_trace", cause.stackTraceToString())
                }
            } ?: JSONObject.NULL)
            put("memory", JSONObject().apply {
                val runtime = Runtime.getRuntime()
                put("free", runtime.freeMemory())
                put("total", runtime.totalMemory())
                put("max", runtime.maxMemory())
                put("free_mb", runtime.freeMemory() / 1024 / 1024)
                put("max_mb", runtime.maxMemory() / 1024 / 1024)
            })
        }.toString(2)
    }

    private fun buildTextReport(throwable: Throwable, context: android.content.Context): String {
        val appInfo = context.packageManager.getPackageInfo(context.packageName, 0)
        return buildString {
            appendLine("=== IPTV Tavern Crash Report ===")
            appendLine("App: ${appInfo.versionName} (${appInfo.versionCode})")
            appendLine("Device: ${Build.MANUFACTURER} ${Build.MODEL}")
            appendLine("Android: ${Build.VERSION.RELEASE} (SDK ${Build.VERSION.SDK_INT})")
            appendLine("Time: ${Instant.now()}")
            appendLine()
            val runtime = Runtime.getRuntime()
            appendLine("Memory: free=${runtime.freeMemory() / 1024 / 1024}MB, " +
                "max=${runtime.maxMemory() / 1024 / 1024}MB, " +
                "total=${runtime.totalMemory() / 1024 / 1024}MB")
            appendLine()
            appendLine("Exception: ${throwable.javaClass.name}")
            appendLine("Message: ${throwable.message ?: "(none)"}")
            appendLine()
            appendLine("Stack trace:")
            appendLine(throwable.stackTraceToString())
            throwable.cause?.let { cause ->
                appendLine()
                appendLine("Caused by: ${cause.javaClass.name}")
                appendLine("Message: ${cause.message ?: "(none)"}")
                appendLine()
                appendLine(cause.stackTraceToString())
            }
        }
    }
}
