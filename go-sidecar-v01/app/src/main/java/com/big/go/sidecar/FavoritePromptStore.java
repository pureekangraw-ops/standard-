package com.big.go.sidecar;

import android.content.Context;
import android.content.SharedPreferences;

import com.big.go.sidecar.core.FavoritePrompt;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

public final class FavoritePromptStore {
    private static final String PREFS = "go_sidecar_favorites";
    private static final String KEY_INDEX = "index";
    private final SharedPreferences prefs;

    public FavoritePromptStore(Context context) {
        prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public List<FavoritePrompt> list() {
        ArrayList<FavoritePrompt> out = new ArrayList<>();
        for (String id : ids()) {
            String name = prefs.getString(key(id, "name"), null);
            String prompt = prefs.getString(key(id, "prompt"), null);
            if (name == null || prompt == null) continue;
            try {
                out.add(new FavoritePrompt(id, name, prompt));
            } catch (IllegalArgumentException ignored) {}
        }
        return Collections.unmodifiableList(out);
    }

    public FavoritePrompt add(String name, String prompt) {
        FavoritePrompt favorite = new FavoritePrompt(UUID.randomUUID().toString(), name, prompt);
        ArrayList<String> ids = ids();
        ids.add(favorite.id);
        prefs.edit()
                .putString(KEY_INDEX, join(ids))
                .putString(key(favorite.id, "name"), favorite.name)
                .putString(key(favorite.id, "prompt"), favorite.prompt)
                .apply();
        return favorite;
    }

    public void update(String id, String name, String prompt) {
        FavoritePrompt favorite = new FavoritePrompt(id, name, prompt);
        if (!ids().contains(favorite.id)) throw new IllegalArgumentException("favorite not found");
        prefs.edit()
                .putString(key(favorite.id, "name"), favorite.name)
                .putString(key(favorite.id, "prompt"), favorite.prompt)
                .apply();
    }

    public void delete(String id) {
        if (id == null) return;
        ArrayList<String> ids = ids();
        ids.remove(id);
        prefs.edit()
                .putString(KEY_INDEX, join(ids))
                .remove(key(id, "name"))
                .remove(key(id, "prompt"))
                .apply();
    }

    private ArrayList<String> ids() {
        ArrayList<String> ids = new ArrayList<>();
        String raw = prefs.getString(KEY_INDEX, "");
        if (raw == null || raw.isEmpty()) return ids;
        for (String id : raw.split(",")) {
            String clean = id.trim();
            if (!clean.isEmpty()) ids.add(clean);
        }
        return ids;
    }

    private static String join(List<String> ids) {
        return String.join(",", ids);
    }

    private static String key(String id, String field) {
        return "favorite." + id + "." + field;
    }
}
