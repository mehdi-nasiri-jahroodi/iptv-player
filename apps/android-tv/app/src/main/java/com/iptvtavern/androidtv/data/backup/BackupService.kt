package com.iptvtavern.androidtv.data.backup

import com.iptvtavern.androidtv.data.local.PlaylistDao
import com.iptvtavern.androidtv.data.local.PlaylistEntity
import com.iptvtavern.androidtv.data.local.ProfileDao
import com.iptvtavern.androidtv.data.local.ProfileEntity
import com.iptvtavern.androidtv.data.local.SettingsDataStore
import com.iptvtavern.androidtv.data.local.SourceDao
import com.iptvtavern.androidtv.data.local.SourceEntity
import com.iptvtavern.androidtv.domain.model.AppSettings
import com.iptvtavern.androidtv.domain.model.Playlist
import com.iptvtavern.androidtv.domain.model.Source
import com.iptvtavern.androidtv.domain.model.UserProfile
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.int
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Backup / restore service.
 *
 * Exports and imports data in the same JSON format as the web app's
 * `lumina-backup.ts` v1 format, enabling cross-platform portability:
 * backup on web → restore on Android TV and vice versa.
 *
 * Web format overview:
 * {
 *   luminaBackup: 1,
 *   exportVersion: 1,
 *   exportedAt: "ISO-8601",
 *   sources: { sources: Source[], activeSourceId: string|null },
 *   playlists: { bySourceId: { [id]: Playlist } },
 *   settingsPersist: string|null,   // Zustand blob (web-specific)
 *   profilePersist: string|null,    // Zustand blob (web-specific)
 *   guidedSourceSetupDone: boolean,
 *   viewerResponsibilityAck: boolean,
 *   appVersion: string              // informational, ignored on import
 * }
 */
@Singleton
class BackupService @Inject constructor(
    private val sourceDao: SourceDao,
    private val playlistDao: PlaylistDao,
    private val profileDao: ProfileDao,
    private val settingsDataStore: SettingsDataStore,
    private val json: Json,
) {

    // ── Export ──────────────────────────────────────────────────

    suspend fun exportToJson(): String = withContext(Dispatchers.IO) {
        val sources = sourceDao.getAllOnce().map { it.toDomain() }
        val activeSourceId = settingsDataStore.activeSourceId.first()
        val playlists = playlistDao.getAllOnce()
        val profile = profileDao.getById("default")?.toDomain()
            ?: UserProfile(id = "default", name = "User")
        val settings = settingsDataStore.settings.first()

        // Build the web-compatible JSON structure
        val sourcesJson = JsonObject(mapOf(
            "sources" to json.encodeToJsonElement(
                kotlinx.serialization.builtins.ListSerializer(Source.serializer()),
                sources,
            ),
            "activeSourceId" to (activeSourceId?.let { JsonPrimitive(it) } ?: JsonNull),
        ))

        val playlistsMap = mutableMapOf<String, JsonElement>()
        for (entity in playlists) {
            try {
                val playlist = json.decodeFromString<Playlist>(entity.playlistJson)
                playlistsMap[entity.sourceId] = json.encodeToJsonElement(
                    Playlist.serializer(),
                    playlist,
                )
            } catch (_: Exception) {
                // Skip corrupted playlist entries
            }
        }
        val playlistsJson = JsonObject(mapOf(
            "bySourceId" to JsonObject(playlistsMap),
        ))

        // Build web-compatible Zustand blobs
        val profilePersist = buildProfilePersistBlob(profile)
        val settingsPersist = buildSettingsPersistBlob(settings)

        val bundle = JsonObject(mapOf(
            "luminaBackup" to JsonPrimitive(1),
            "exportVersion" to JsonPrimitive(1),
            "exportedAt" to JsonPrimitive(Instant.now().toString()),
            "sources" to sourcesJson,
            "playlists" to playlistsJson,
            "settingsPersist" to JsonPrimitive(settingsPersist),
            "profilePersist" to JsonPrimitive(profilePersist),
            "guidedSourceSetupDone" to JsonPrimitive(true),
            "viewerResponsibilityAck" to JsonPrimitive(true),
            "appVersion" to JsonPrimitive("0.1.0-android"),
        ))

        json.encodeToString(JsonElement.serializer(), bundle)
    }

    private fun buildProfilePersistBlob(profile: UserProfile): String {
        val profileObj = JsonObject(mapOf(
            "id" to JsonPrimitive(profile.id),
            "name" to JsonPrimitive(profile.name),
            "favorites" to JsonArray(profile.favorites.map { JsonPrimitive(it) }),
            "recents" to JsonArray(profile.recents.map { JsonPrimitive(it) }),
        ))
        val blob = JsonObject(mapOf(
            "state" to JsonObject(mapOf(
                "profile" to profileObj,
                "catalogOrders" to JsonObject(emptyMap()),
            )),
            "version" to JsonPrimitive(1),
        ))
        return json.encodeToString(JsonElement.serializer(), blob)
    }

    private fun buildSettingsPersistBlob(settings: AppSettings): String {
        val blob = JsonObject(mapOf(
            "state" to JsonObject(mapOf(
                "streamProxy" to JsonNull,
                "acknowledgedResponsibilityV1" to JsonPrimitive(true),
            )),
            "version" to JsonPrimitive(1),
        ))
        return json.encodeToString(JsonElement.serializer(), blob)
    }

    // ── Import ─────────────────────────────────────────────────

    sealed class ImportResult {
        data class Success(val sourcesCount: Int) : ImportResult()
        data class Error(val message: String) : ImportResult()
    }

    suspend fun importFromJson(jsonText: String): ImportResult = withContext(Dispatchers.IO) {
        // 1. Parse JSON
        val parsed: JsonObject = try {
            json.decodeFromString<JsonElement>(jsonText).jsonObject
        } catch (_: Exception) {
            return@withContext ImportResult.Error("This file is not valid JSON.")
        }

        // 2. Validate v1 backup markers
        val marker = parsed["luminaBackup"]?.jsonPrimitive?.intOrNull
        val version = parsed["exportVersion"]?.jsonPrimitive?.intOrNull
        if (marker != 1 || version != 1) {
            return@withContext ImportResult.Error("This file is not a valid Lumina backup.")
        }

        // 3. Parse sources
        val sourcesObj = parsed["sources"]?.jsonObject
            ?: return@withContext ImportResult.Error("Missing sources in backup.")
        val sourcesArray = sourcesObj["sources"]?.jsonArray
            ?: return@withContext ImportResult.Error("Missing sources array in backup.")
        val activeSourceId = sourcesObj["activeSourceId"]
            ?.takeIf { it !is JsonNull }
            ?.jsonPrimitive?.content

        val importedSources: List<Source> = try {
            sourcesArray.map { element ->
                json.decodeFromJsonElement(Source.serializer(), element)
            }
        } catch (e: Exception) {
            return@withContext ImportResult.Error("Invalid source data: ${e.message}")
        }

        // Normalize activeSourceId
        val sourceIds = importedSources.map { it.id }.toSet()
        val normalizedActiveId = if (activeSourceId != null && activeSourceId in sourceIds) {
            activeSourceId
        } else {
            importedSources.firstOrNull()?.id
        }

        // 4. Parse playlists
        val playlistsObj = parsed["playlists"]?.jsonObject
        val bySourceId = playlistsObj?.get("bySourceId")?.jsonObject

        // 5. Parse profile from profilePersist blob
        val profile = parseProfileFromPersistBlob(
            parsed["profilePersist"]?.jsonPrimitive?.content
        )

        // 6. Clear existing data
        sourceDao.deleteAll()
        playlistDao.deleteAll()
        profileDao.deleteAll()

        // 7. Insert imported sources
        for (source in importedSources) {
            sourceDao.insert(SourceEntity.fromDomain(source))
        }

        // 8. Insert imported playlists (only for known sources)
        if (bySourceId != null) {
            for ((sourceId, playlistElement) in bySourceId) {
                if (sourceId !in sourceIds) continue
                try {
                    val playlist = json.decodeFromJsonElement(Playlist.serializer(), playlistElement)
                    val playlistJson = json.encodeToString(Playlist.serializer(), playlist)
                    playlistDao.insert(
                        PlaylistEntity(
                            sourceId = sourceId,
                            playlistJson = playlistJson,
                            fetchedAt = playlist.fetchedAt,
                        )
                    )
                } catch (_: Exception) {
                    // Skip invalid playlist entries
                }
            }
        }

        // 9. Insert profile
        if (profile != null) {
            profileDao.insert(ProfileEntity.fromDomain(profile))
        } else {
            profileDao.insert(
                ProfileEntity.fromDomain(
                    UserProfile(id = "default", name = "User")
                )
            )
        }

        // 10. Set active source
        settingsDataStore.setActiveSourceId(normalizedActiveId)

        ImportResult.Success(sourcesCount = importedSources.size)
    }

    /**
     * Extract profile data from the web's Zustand profilePersist blob.
     * Format: {"state":{"profile":{"id","name","favorites":[],"recents":[]},"catalogOrders":{}},"version":1}
     */
    private fun parseProfileFromPersistBlob(blob: String?): UserProfile? {
        if (blob.isNullOrBlank()) return null
        return try {
            val parsed = json.decodeFromString<JsonElement>(blob).jsonObject
            val state = parsed["state"]?.jsonObject ?: return null
            val profileObj = state["profile"]?.jsonObject ?: return null
            val id = profileObj["id"]?.jsonPrimitive?.content ?: "default"
            val name = profileObj["name"]?.jsonPrimitive?.content ?: "User"
            val favorites = profileObj["favorites"]?.jsonArray
                ?.mapNotNull { it.jsonPrimitive.content } ?: emptyList()
            val recents = profileObj["recents"]?.jsonArray
                ?.mapNotNull { it.jsonPrimitive.content } ?: emptyList()
            UserProfile(id = id, name = name, favorites = favorites, recents = recents)
        } catch (_: Exception) {
            null
        }
    }
}
