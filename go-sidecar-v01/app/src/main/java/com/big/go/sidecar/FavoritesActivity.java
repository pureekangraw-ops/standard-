package com.big.go.sidecar;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import com.big.go.sidecar.core.FavoritePrompt;

import java.util.List;

public final class FavoritesActivity extends Activity {
    private FavoritePromptStore store;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        store = new FavoritePromptStore(this);
        refresh();
    }

    private void refresh() {
        setContentView(buildUi());
    }

    private View buildUi() {
        ScrollView scroll = new ScrollView(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(20), dp(20), dp(20), dp(20));
        root.setBackgroundColor(Color.WHITE);
        scroll.addView(root, new ScrollView.LayoutParams(-1, -2));

        TextView title = new TextView(this);
        title.setText("Favorites · ปุ่มของบิ๊ก");
        title.setTextSize(24);
        title.setTextColor(Color.BLACK);
        title.setTypeface(null, 1);
        root.addView(title);

        TextView desc = new TextView(this);
        desc.setText("แตะ Favorite = คัดลอก Prompt แล้วกลับไปวางในห้อง ChatGPT ที่เปิดอยู่ · ไม่ Share และไม่เรียก API");
        desc.setTextColor(Color.DKGRAY);
        desc.setTextSize(14);
        desc.setPadding(0, dp(8), 0, dp(12));
        root.addView(desc);

        List<FavoritePrompt> favorites = store.list();
        if (favorites.isEmpty()) {
            TextView empty = new TextView(this);
            empty.setText("ยังไม่มี Favorite — เพิ่มปุ่มที่ใช้บ่อยได้เลย");
            empty.setTextColor(Color.DKGRAY);
            empty.setPadding(0, dp(8), 0, dp(8));
            root.addView(empty);
        }

        for (FavoritePrompt favorite : favorites) {
            Button use = button("⭐ " + favorite.name);
            use.setOnClickListener(v -> copyAndClose(favorite));
            root.addView(use, new LinearLayout.LayoutParams(-1, -2));

            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.HORIZONTAL);
            Button edit = button("แก้ไข");
            Button delete = button("ลบ");
            edit.setOnClickListener(v -> showEditor(favorite));
            delete.setOnClickListener(v -> confirmDelete(favorite));
            row.addView(edit, new LinearLayout.LayoutParams(0, -2, 1f));
            row.addView(delete, new LinearLayout.LayoutParams(0, -2, 1f));
            root.addView(row);
        }

        Button add = button("＋ เพิ่ม Favorite");
        add.setOnClickListener(v -> showEditor(null));
        root.addView(add, new LinearLayout.LayoutParams(-1, -2));

        Button close = button("ปิด");
        close.setOnClickListener(v -> finish());
        root.addView(close, new LinearLayout.LayoutParams(-1, -2));
        return scroll;
    }

    private void showEditor(FavoritePrompt existing) {
        LinearLayout form = new LinearLayout(this);
        form.setOrientation(LinearLayout.VERTICAL);
        form.setPadding(dp(18), dp(4), dp(18), 0);

        EditText name = new EditText(this);
        name.setHint("ชื่อปุ่ม เช่น การเงิน");
        if (existing != null) name.setText(existing.name);
        form.addView(name, new LinearLayout.LayoutParams(-1, -2));

        EditText prompt = new EditText(this);
        prompt.setHint("Prompt ที่ต้องการคัดลอก");
        prompt.setMinLines(5);
        if (existing != null) prompt.setText(existing.prompt);
        form.addView(prompt, new LinearLayout.LayoutParams(-1, -2));

        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle(existing == null ? "เพิ่ม Favorite" : "แก้ Favorite")
                .setView(form)
                .setNegativeButton("ยกเลิก", null)
                .setPositiveButton("บันทึก", null)
                .create();
        dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            try {
                if (existing == null) {
                    store.add(name.getText().toString(), prompt.getText().toString());
                } else {
                    store.update(existing.id, name.getText().toString(), prompt.getText().toString());
                }
                dialog.dismiss();
                refresh();
            } catch (IllegalArgumentException e) {
                Toast.makeText(this, "ต้องใส่ชื่อและ Prompt", Toast.LENGTH_LONG).show();
            }
        }));
        dialog.show();
    }

    private void confirmDelete(FavoritePrompt favorite) {
        new AlertDialog.Builder(this)
                .setTitle("ลบ " + favorite.name + " ?")
                .setMessage("ลบเฉพาะปุ่ม Favorite นี้")
                .setNegativeButton("ยกเลิก", null)
                .setPositiveButton("ลบ", (dialog, which) -> {
                    store.delete(favorite.id);
                    refresh();
                })
                .show();
    }

    private void copyAndClose(FavoritePrompt favorite) {
        ClipboardManager cb = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        cb.setPrimaryClip(ClipData.newPlainText("GO Favorite · " + favorite.name, favorite.prompt));
        Toast.makeText(this, "คัดลอก " + favorite.name + " แล้ว — กลับไปวางในห้องเดิม", Toast.LENGTH_LONG).show();
        finish();
    }

    private Button button(String text) {
        Button b = new Button(this);
        b.setText(text);
        b.setAllCaps(false);
        return b;
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}
