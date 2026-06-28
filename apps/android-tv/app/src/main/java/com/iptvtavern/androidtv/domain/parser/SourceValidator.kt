package com.iptvtavern.androidtv.domain.parser

import com.iptvtavern.androidtv.domain.model.Source
import com.iptvtavern.androidtv.domain.model.SourceType
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.IOException
import java.net.HttpURLConnection
import java.net.MalformedURLException
import java.net.URL

/**
 * Source validation — Kotlin port of `packages/core/src/lib/source-validator.ts`.
 *
 * Validates a source before saving: checks URL reachability, parses the
 * M3U content, and returns a typed result.
 *
 * ## Differences from web version
 *
 * - **No CORS**: Android makes direct HTTP requests — no proxy needed,
 *   no `cors_blocked` error code.
 * - **No Xtream validation here**: Xtream auth is handled in Phase 8.
 *   This validator covers M3U URL and M3U file sources only.
 * - Uses `HttpURLConnection` (simple, no extra dependencies). Phase 3
 *   doesn't need OkHttp yet — that comes with networking in later phases.
 */

/** Error codes returned when validation fails. */
enum class SourceValidationErrorCode {
    INVALID_URL,
    UNREACHABLE,
    PARSE_ERROR,
    EMPTY_CONTENT,
}

/** Validation result — either success with the source, or failure with a code + message. */
sealed class SourceValidationResult {
    data class Success(val source: Source) : SourceValidationResult()
    data class Failure(
        val code: SourceValidationErrorCode,
        val message: String,
    ) : SourceValidationResult()
}

/**
 * Validate a source input and attempt to parse its M3U content.
 *
 * @param source      The source to validate.
 * @param rawM3uText  For `m3u_file` sources: the raw file content. Ignored for URL sources.
 * @return [SourceValidationResult.Success] with the validated source, or
 *         [SourceValidationResult.Failure] with an error code and message.
 */
suspend fun validateSource(
    source: Source,
    rawM3uText: String? = null,
): SourceValidationResult {
    return when (source.type) {
        SourceType.M3U_FILE -> validateM3uFile(source, rawM3uText)
        SourceType.M3U_URL -> validateM3uUrl(source)
        SourceType.XTREAM -> {
            // Xtream validation (auth probe) is handled in Phase 8.
            // For now, just check that credentials are present.
            if (source.credentials == null) {
                SourceValidationResult.Failure(
                    code = SourceValidationErrorCode.INVALID_URL,
                    message = "Xtream sources require credentials.",
                )
            } else {
                SourceValidationResult.Success(source)
            }
        }
    }
}

/**
 * If the source has no manually-set [Source.epgUrl], auto-populate it from
 * the M3U file's `#EXTM3U url-tvg="..."` header attribute.
 *
 * Called during validation — the raw M3U text is already in memory, so this
 * is essentially free. Manual user input always takes precedence.
 */
private fun Source.withEpgFromTvg(rawM3uText: String): Source {
    if (!epgUrl.isNullOrBlank()) return this
    return extractUrlTvg(rawM3uText)?.let { copy(epgUrl = it) } ?: this
}

private fun validateM3uFile(source: Source, rawM3uText: String?): SourceValidationResult {
    val content = rawM3uText?.trim().orEmpty()
    if (content.isEmpty()) {
        return SourceValidationResult.Failure(
            code = SourceValidationErrorCode.EMPTY_CONTENT,
            message = "M3U file content is empty.",
        )
    }
    return try {
        parseM3uToPlaylist(content, source.id)
        SourceValidationResult.Success(source.withEpgFromTvg(content))
    } catch (e: Exception) {
        SourceValidationResult.Failure(
            code = SourceValidationErrorCode.PARSE_ERROR,
            message = e.message ?: "Failed to parse M3U content.",
        )
    }
}

/**
 * Fetch and validate an M3U URL.
 *
 * Runs on [Dispatchers.IO] since it does network I/O.
 * Uses [HttpURLConnection] — the simplest JDK HTTP client, no extra deps.
 */
private suspend fun validateM3uUrl(source: Source): SourceValidationResult {
    val urlString = source.url
    if (urlString.isNullOrBlank()) {
        return SourceValidationResult.Failure(
            code = SourceValidationErrorCode.INVALID_URL,
            message = "M3U URL sources require a URL.",
        )
    }

    // Validate URL format
    try {
        URL(urlString)
    } catch (_: MalformedURLException) {
        return SourceValidationResult.Failure(
            code = SourceValidationErrorCode.INVALID_URL,
            message = "Invalid URL format.",
        )
    }

    return withContext(Dispatchers.IO) {
        try {
            val connection = URL(urlString).openConnection() as HttpURLConnection
            connection.connectTimeout = 15_000
            connection.readTimeout = 30_000
            connection.requestMethod = "GET"
            // Apply per-source User-Agent if set
            source.userAgent?.let { connection.setRequestProperty("User-Agent", it) }

            try {
                val status = connection.responseCode
                if (status !in 200..299) {
                    return@withContext SourceValidationResult.Failure(
                        code = SourceValidationErrorCode.UNREACHABLE,
                        message = "Source URL returned HTTP $status.",
                    )
                }

                val text = connection.inputStream.bufferedReader().use { it.readText() }.trim()
                if (text.isEmpty()) {
                    return@withContext SourceValidationResult.Failure(
                        code = SourceValidationErrorCode.EMPTY_CONTENT,
                        message = "Source URL returned empty body.",
                    )
                }

                // Try parsing — if it throws, content is not valid M3U
                parseM3uToPlaylist(text, source.id)
                SourceValidationResult.Success(source.withEpgFromTvg(text))
            } finally {
                connection.disconnect()
            }
        } catch (_: IOException) {
            SourceValidationResult.Failure(
                code = SourceValidationErrorCode.UNREACHABLE,
                message = "Could not reach the source URL. Check the address and your network.",
            )
        } catch (e: Exception) {
            SourceValidationResult.Failure(
                code = SourceValidationErrorCode.PARSE_ERROR,
                message = e.message ?: "Failed to parse M3U content from URL.",
            )
        }
    }
}
