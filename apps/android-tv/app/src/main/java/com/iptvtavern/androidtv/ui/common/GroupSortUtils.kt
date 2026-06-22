package com.iptvtavern.androidtv.ui.common

import com.iptvtavern.androidtv.domain.model.ChannelGroup
import com.iptvtavern.androidtv.domain.model.GroupSortDir
import com.iptvtavern.androidtv.domain.model.GroupSortKey

/**
 * Sort groups while keeping virtual groups (id starting with "__") pinned at the top.
 */
fun sortGroups(
    groups: List<ChannelGroup>,
    key: GroupSortKey,
    dir: GroupSortDir = GroupSortDir.ASC,
): List<ChannelGroup> {
    if (key == GroupSortKey.DEFAULT) return groups

    val (virtual, regular) = groups.partition { it.id.startsWith("__") }
    val sorted = when (key) {
        GroupSortKey.DEFAULT -> regular
        GroupSortKey.NAME -> regular.sortedBy { it.name.lowercase() }
        GroupSortKey.SIZE -> regular.sortedByDescending { it.effectiveChannelCount() }
    }
    val finalSorted = if (dir == GroupSortDir.DESC) sorted.reversed() else sorted
    return virtual + finalSorted
}
