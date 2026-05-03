package com.iptvtavern.androidtv.domain.model

import kotlinx.serialization.Serializable

/**
 * User profile — favorites and recently played channels.
 *
 * Aligned with `contracts.ts#userProfileSchema`.
 *
 * Web equivalent: Zustand profile store backed by localStorage.
 * Android equivalent: Room entity in the `profiles` table.
 */
@Serializable
data class UserProfile(
    val id: String,
    val name: String,
    /** Channel IDs the user has favorited. */
    val favorites: List<String> = emptyList(),
    /** Channel IDs the user has recently played (most recent first). */
    val recents: List<String> = emptyList(),
)
