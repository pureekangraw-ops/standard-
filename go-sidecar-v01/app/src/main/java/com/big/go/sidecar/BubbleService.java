package com.big.go.sidecar;

import android.app.NotificationManager;
import android.app.Service;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.provider.Settings;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import com.big.go.sidecar.core.BridgePayload;
import com.big.go.sidecar.core.BubbleActionRouter;
import com.big.go.sidecar.core.BubbleGesturePolicy;
import com.big.go.sidecar.core.BubbleVisibilityPolicy;
import com.big.go.sidecar.core.CommandPaletteCatalog;
import com.big.go.sidecar.core.FavoritePrompt;
import com.big.go.sidecar.core.PracticalLensCatalog;
import com.big.go.sidecar.core.SlidePromptCatalog;

import java.io.File;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class BubbleService extends Service {
    static final String ACTION_START = "com.big.go.sidecar.START";
    static final String ACTION_TOGGLE_BUBBLE = "com.big.go.sidecar.TOGGLE_BUBBLE";
    static final String ACTION_STOP = "com.big.go.sidecar.STOP";
    static final String ACTION_CAPTURE_READY = "com.big.go.sidecar.CAPTURE_READY";
    static final String ACTION_QUICK_CROP_READY = "com.big.go.sidecar.QUICK_CROP_READY";
    static final String ACTION_CAPTURE_FAILED = "com.big.go.sidecar.CAPTURE_FAILED";
    static final String ACTION_CAPTURE_CANCELLED = "com.big.go.sidecar.CAPTURE_CANCELLED";
    static final String EXTRA_CAPTURE_PATH = "capture_path";
    static final String EXTRA_ERROR = "error";
    private static final long MODE_LONG_PRESS_MS = 650L;

    private WindowManager wm;
    private TextView bubble;
    private WindowManager.LayoutParams bubbleParams;
    private View panel;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private File currentCapture;
    private boolean bubbleVisible = BubbleVisibilityPolicy.initiallyVisible();

    @Override
    public void onCreate() {
        super.onCreate();
        NotificationHelper.ensureChannels(this);
        startForeground(
                2001,
                NotificationHelper.sidecar(this, bubbleVisible),
                ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        wm = (WindowManager) getSystemService(WINDOW_SERVICE);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || intent.getAction() == null) return START_STICKY;
        String action = intent.getAction();

        if (ACTION_TOGGLE_BUBBLE.equals(action)) {
            setBubbleVisible(BubbleVisibilityPolicy.toggle(bubbleVisible));
        } else if (ACTION_STOP.equals(action)) {
            stopSelf();
        } else if (ACTION_CAPTURE_READY.equals(action)) {
            String path = intent.getStringExtra(EXTRA_CAPTURE_PATH);
            if (path != null) showPreview(new File(path));
        } else if (ACTION_QUICK_CROP_READY.equals(action)) {
            String path = intent.getStringExtra(EXTRA_CAPTURE_PATH);
            if (path != null) openQuickCrop(new File(path));
        } else if (ACTION_CAPTURE_FAILED.equals(action)) {
            showError(intent.getStringExtra(EXTRA_ERROR));
        } else if (ACTION_CAPTURE_CANCELLED.equals(action)) {
            setBubbleText("GO");
        } else if (ACTION_START.equals(action)) {
            updateNotification();
        }
        return START_STICKY;
    }

    private void setBubbleVisible(boolean visible) {
        if (visible) {
            if (!Settings.canDrawOverlays(this)) {
                toast("ต้องอนุญาตให้ GO แสดงทับแอปอื่นก่อน");
                bubbleVisible = false;
                updateNotification();
                return;
            }
            addBubble();
            bubbleVisible = bubble != null;
        } else {
            closePanel(false);
            removeBubble();
            bubbleVisible = false;
        }
        updateNotification();
    }

    private void updateNotification() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.notify(2001, NotificationHelper.sidecar(this, bubbleVisible));
    }

    private void addBubble() {
        if (bubble != null) return;
        bubble = new TextView(this);
        bubble.setText("GO");
        bubble.setTextColor(Color.WHITE);
        bubble.setTextSize(16);
        bubble.setGravity(Gravity.CENTER);
        bubble.setTypeface(null, 1);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(0xff1d4ed8);
        bg.setShape(GradientDrawable.OVAL);
        bubble.setBackground(bg);
        int size = dp(58);
        bubbleParams = new WindowManager.LayoutParams(
                size, size,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
                PixelFormat.TRANSLUCENT);
        bubbleParams.gravity = Gravity.TOP | Gravity.END;
        bubbleParams.x = dp(12);
        bubbleParams.y = dp(180);
        bubble.setOnTouchListener(new BubbleTouch());
        wm.addView(bubble, bubbleParams);
    }

    private void removeBubble() {
        if (bubble == null) return;
        try { wm.removeView(bubble); } catch (Exception ignored) {}
        bubble = null;
        bubbleParams = null;
    }

    private void askGo() {
        closePanel(false);
        setBubbleText("…");
        Intent i = new Intent(this, CaptureConsentActivity.class)
                .putExtra(CaptureConsentActivity.EXTRA_FLOW, CaptureConsentActivity.FLOW_ANALYZE)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(i);
    }

    private void startQuickCrop() {
        closePanel(false);
        setBubbleText("✂");
        Intent i = new Intent(this, CaptureConsentActivity.class)
                .putExtra(CaptureConsentActivity.EXTRA_FLOW, CaptureConsentActivity.FLOW_QUICK_CROP)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(i);
    }

    private void startGalleryShare() {
        closePanel(false);
        Intent i = new Intent(this, GalleryShareActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(i);
    }

    private void startClipboardAssistant() {
        closePanel(false);
        Intent i = new Intent(this, ClipboardAssistantActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(i);
    }

    private void startFavorites() {
        closePanel(false);
        Intent i = new Intent(this, FavoritesActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(i);
    }

    private void startSchedule() {
        closePanel(false);
        Intent i = new Intent(this, ScheduleActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(i);
    }

    private void openQuickCrop(File file) {
        setBubbleText("GO");
        closePanel(false);
        Intent i = new Intent(this, QuickCropActivity.class)
                .putExtra(QuickCropActivity.EXTRA_CAPTURE_PATH, file.getAbsolutePath())
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(i);
    }

    private void showModeMenu() {
        closePanel(false);
        LinearLayout card = baseCard();
        LinearLayout header = row();
        TextView heading = title("GO");
        heading.setGravity(Gravity.CENTER_VERTICAL);
        Button closeTop = button("✕");
        closeTop.setOnClickListener(v -> closePanel(false));
        header.addView(heading, weight());
        header.addView(closeTop, new LinearLayout.LayoutParams(dp(52), -2));
        card.addView(header, new LinearLayout.LayoutParams(-1, -2));
        card.addView(body("งานภาพใช้ Share · คำสั่งใช้ Clipboard โดยบิ๊กเป็นคนวางและส่งเอง"));

        Button ask = button("🧠 ถาม GO จากหน้าจอ");
        ask.setOnClickListener(v -> askGo());
        card.addView(ask, fullButton());

        card.addView(sectionLabel("คำสั่ง GO"));
        addCommandButtons(card, CommandPaletteCatalog.primary());
        Button moreCommands = button("⋯ คำสั่งเพิ่ม");
        moreCommands.setOnClickListener(v -> showMoreCommandMenu());
        card.addView(moreCommands, fullButton());

        card.addView(sectionLabel("งานด่วน"));

        Button quickCrop = button("✂️ ตัดหน้าจอ");
        quickCrop.setOnClickListener(v -> startQuickCrop());
        Button gallery = button("🖼️ รูปจากคลัง");
        gallery.setOnClickListener(v -> startGalleryShare());
        addButtonPair(card, quickCrop, gallery);

        Button clipboard = button("📋 Clipboard Assistant");
        clipboard.setOnClickListener(v -> startClipboardAssistant());
        card.addView(clipboard, fullButton());

        card.addView(sectionLabel("ผลิตสไลด์"));
        List<SlidePromptCatalog.SlidePrompt> slidePrompts = SlidePromptCatalog.all();
        Button createSlide = button(slidePrompts.get(0).label);
        createSlide.setOnClickListener(v -> copySlidePrompt(slidePrompts.get(0)));
        Button patchSlide = button(slidePrompts.get(1).label);
        patchSlide.setOnClickListener(v -> copySlidePrompt(slidePrompts.get(1)));
        addButtonPair(card, createSlide, patchSlide);

        card.addView(sectionLabel("เลนส์ชีวิตและงาน"));
        List<PracticalLensCatalog.PracticalLens> lenses = PracticalLensCatalog.all();
        for (int i = 0; i < lenses.size(); i += 2) {
            PracticalLensCatalog.PracticalLens first = lenses.get(i);
            Button firstButton = button(first.label);
            firstButton.setOnClickListener(v -> copyPracticalLens(first));

            Button secondButton = null;
            if (i + 1 < lenses.size()) {
                PracticalLensCatalog.PracticalLens second = lenses.get(i + 1);
                secondButton = button(second.label);
                secondButton.setOnClickListener(v -> copyPracticalLens(second));
            }
            addButtonPair(card, firstButton, secondButton);
        }

        List<FavoritePrompt> savedFavorites = new FavoritePromptStore(this).list();
        if (!savedFavorites.isEmpty()) {
            card.addView(sectionLabel("ปุ่มลัดของบิ๊ก"));
            int visibleFavorites = Math.min(4, savedFavorites.size());
            for (int i = 0; i < visibleFavorites; i += 2) {
                FavoritePrompt first = savedFavorites.get(i);
                Button firstButton = button("⭐ " + first.name);
                firstButton.setOnClickListener(v -> copyFavorite(first));

                Button secondButton = null;
                if (i + 1 < visibleFavorites) {
                    FavoritePrompt second = savedFavorites.get(i + 1);
                    secondButton = button("⭐ " + second.name);
                    secondButton.setOnClickListener(v -> copyFavorite(second));
                }
                addButtonPair(card, firstButton, secondButton);
            }
        }

        card.addView(sectionLabel("เครื่องมือ"));
        Button favorites = button("⭐ Favorites");
        favorites.setOnClickListener(v -> startFavorites());
        Button schedule = button("⏰ Schedule");
        schedule.setOnClickListener(v -> startSchedule());
        addButtonPair(card, favorites, schedule);

        Button close = button("ปิด");
        close.setOnClickListener(v -> closePanel(false));
        card.addView(close, fullButton());
        showPanel(card, true);
    }

    private void showMoreCommandMenu() {
        closePanel(false);
        LinearLayout card = baseCard();
        LinearLayout header = row();
        TextView heading = title("คำสั่ง GO");
        heading.setGravity(Gravity.CENTER_VERTICAL);
        Button closeTop = button("✕");
        closeTop.setOnClickListener(v -> closePanel(false));
        header.addView(heading, weight());
        header.addView(closeTop, new LinearLayout.LayoutParams(dp(52), -2));
        card.addView(header, new LinearLayout.LayoutParams(-1, -2));
        card.addView(body("เลือกคำสั่งเพื่อล็อกพฤติกรรมของ GO · บิ๊กเป็นคนวางและส่งเอง"));

        card.addView(sectionLabel("คำสั่งเพิ่ม"));
        addCommandButtons(card, CommandPaletteCatalog.more());

        card.addView(sectionLabel("คำสั่งเฉพาะ"));
        addCommandButtons(card, CommandPaletteCatalog.contextual());

        Button back = button("← กลับเมนู GO");
        back.setOnClickListener(v -> showModeMenu());
        card.addView(back, fullButton());
        showPanel(card, true);
    }

    private void addCommandButtons(LinearLayout card, List<CommandPaletteCatalog.Command> commands) {
        for (int i = 0; i < commands.size(); i += 2) {
            CommandPaletteCatalog.Command first = commands.get(i);
            Button firstButton = button(first.label);
            firstButton.setOnClickListener(v -> copyCommand(first));

            Button secondButton = null;
            if (i + 1 < commands.size()) {
                CommandPaletteCatalog.Command second = commands.get(i + 1);
                secondButton = button(second.label);
                secondButton.setOnClickListener(v -> copyCommand(second));
            }
            addButtonPair(card, firstButton, secondButton);
        }
    }

    private void copyCommand(CommandPaletteCatalog.Command command) {
        ClipboardManager cb = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        cb.setPrimaryClip(ClipData.newPlainText("GO COMMAND · " + command.id, command.prompt));
        closePanel(false);
        toast("คัดลอก " + command.label + " แล้ว — วางในห้อง ChatGPT ที่เปิดอยู่");
    }

    private void copyFavorite(FavoritePrompt favorite) {
        ClipboardManager cb = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        cb.setPrimaryClip(ClipData.newPlainText("GO Favorite · " + favorite.name, favorite.prompt));
        closePanel(false);
        toast("คัดลอก " + favorite.name + " แล้ว — วางในห้อง ChatGPT ที่เปิดอยู่");
    }

    private void copyPracticalLens(PracticalLensCatalog.PracticalLens lens) {
        ClipboardManager cb = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        cb.setPrimaryClip(ClipData.newPlainText("GO PRACTICAL LENS · " + lens.id, lens.prompt));
        closePanel(false);
        toast("คัดลอก " + lens.label + " แล้ว — วางในห้อง ChatGPT ที่เปิดอยู่");
    }

    private void copySlidePrompt(SlidePromptCatalog.SlidePrompt prompt) {
        ClipboardManager cb = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        cb.setPrimaryClip(ClipData.newPlainText("GO SLIDE · " + prompt.id, prompt.prompt));
        closePanel(false);
        toast("คัดลอก " + prompt.label + " แล้ว — วางในห้องผลิตที่เปิดอยู่");
    }

    private void showPreview(File file) {
        currentCapture = file;
        setBubbleText("GO");
        closePanel(false);
        LinearLayout card = baseCard();
        card.addView(title("ภาพที่จะส่งให้ GO"));

        ImageView preview = new ImageView(this);
        preview.setAdjustViewBounds(true);
        preview.setMaxHeight(dp(210));
        preview.setImageURI(Uri.fromFile(file));
        card.addView(preview, new LinearLayout.LayoutParams(-1, -2));

        card.addView(body("ตรวจภาพก่อนส่ง หากมีรหัสผ่าน / OTP / ข้อมูลชำระเงิน ให้กดยกเลิก"));

        EditText intent = new EditText(this);
        intent.setHint("อยากให้ GO ช่วยอะไร (เว้นว่างได้)");
        intent.setText("ช่วยดูสิ่งที่อยู่บนหน้าจอและร่างคำตอบหรือสิ่งที่ควรทำต่อ");
        intent.setMinLines(2);
        card.addView(intent, new LinearLayout.LayoutParams(-1, -2));

        LinearLayout buttons = row();
        Button analyze = button("ส่งให้ GO");
        Button room = button("เลือกห้อง");
        Button cancel = button("ยกเลิก");
        buttons.addView(analyze, weight());
        buttons.addView(room, weight());
        buttons.addView(cancel, weight());
        card.addView(buttons);

        analyze.setOnClickListener(v -> analyzeCurrent(intent.getText().toString()));
        room.setOnClickListener(v -> routeCaptureToRoom(intent.getText().toString()));
        cancel.setOnClickListener(v -> closePanel(true));
        showPanel(card);
    }

    private void routeCaptureToRoom(String request) {
        if (currentCapture == null || !currentCapture.exists()) {
            showError("ไม่พบภาพที่จับไว้");
            return;
        }
        Uri image = new Uri.Builder()
                .scheme("content")
                .authority(getPackageName() + ".capture")
                .appendPath(currentCapture.getName())
                .build();
        Intent route = new Intent(Intent.ACTION_SEND)
                .setType("image/png")
                .putExtra(Intent.EXTRA_STREAM, image)
                .putExtra(Intent.EXTRA_TEXT, request)
                .putExtra(RoomShareActivity.EXTRA_SOURCE_LABEL, "ภาพหน้าจอ")
                .setClass(this, RoomShareActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        route.setClipData(ClipData.newUri(getContentResolver(), "GO screen capture", image));
        closePanel(false);
        startActivity(route);
    }

    private void analyzeCurrent(String intent) {
        if (currentCapture == null || !currentCapture.exists()) {
            showError("ไม่พบภาพที่จับไว้");
            return;
        }
        showLoading();
        File capture = currentCapture;
        worker.execute(() -> {
            try {
                String key = SecureKeyStore.load(this);
                if (key == null || key.isEmpty()) throw new IllegalStateException("ยังไม่มี API key ในเครื่อง");
                GoResult result = OpenAiVisionClient.analyze(capture, key, intent);
                main.post(() -> showDraft(result));
            } catch (Exception e) {
                main.post(() -> showError(e.getMessage()));
            }
        });
    }

    private void showLoading() {
        closePanel(false);
        LinearLayout card = baseCard();
        card.addView(title("GO กำลังดูหน้าจอ…"));
        card.addView(body("กำลังวิเคราะห์ภาพที่คุณยืนยันส่ง"));
        showPanel(card);
    }

    private void showDraft(GoResult result) {
        closePanel(false);
        LinearLayout card = baseCard();
        card.addView(title("GO · " + result.kind));
        if (!result.observed.isEmpty()) card.addView(body(result.observed));
        if (!result.reason.isEmpty()) card.addView(body(result.reason));

        EditText draft = new EditText(this);
        draft.setText(result.draft);
        draft.setMinLines(4);
        draft.setGravity(Gravity.TOP);
        card.addView(draft, new LinearLayout.LayoutParams(-1, -2));

        LinearLayout row1 = row();
        Button copy = button("คัดลอก Draft");
        Button retry = button("ลองใหม่");
        row1.addView(copy, weight());
        row1.addView(retry, weight());
        card.addView(row1);

        Button handoff = button("ส่งต่อเข้า GO");
        card.addView(handoff, new LinearLayout.LayoutParams(-1, -2));
        Button close = button("ปิด");
        card.addView(close, new LinearLayout.LayoutParams(-1, -2));

        copy.setOnClickListener(v -> {
            ClipboardManager cb = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            cb.setPrimaryClip(ClipData.newPlainText("GO Draft", draft.getText().toString()));
            toast("คัดลอกแล้ว — BIG เป็นคนกดส่งเอง");
        });
        retry.setOnClickListener(v -> {
            if (currentCapture != null && currentCapture.exists()) showPreview(currentCapture);
            else askGo();
        });
        handoff.setOnClickListener(v -> shareToMainGo(result, draft.getText().toString()));
        close.setOnClickListener(v -> closePanel(true));
        showPanel(card);
    }

    private void shareToMainGo(GoResult result, String editedDraft) {
        String observed = result.observed.isEmpty()
                ? "ใช้ภาพหน้าจอที่แนบเป็นบริบทหลัก"
                : result.observed;
        String handoffText = BridgePayload.format(result.kind, observed, result.reason, editedDraft);

        Intent share = new Intent(Intent.ACTION_SEND);
        share.putExtra(Intent.EXTRA_TEXT, handoffText);
        if (currentCapture != null && currentCapture.exists()) {
            Uri image = new Uri.Builder()
                    .scheme("content")
                    .authority(getPackageName() + ".capture")
                    .appendPath(currentCapture.getName())
                    .build();
            share.setType("image/png");
            share.putExtra(Intent.EXTRA_STREAM, image);
            share.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            share.setClipData(ClipData.newUri(getContentResolver(), "GO screen context", image));
        } else {
            share.setType("text/plain");
        }

        closePanel(false);
        Intent direct = new Intent(share)
                .setPackage("com.openai.chatgpt")
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            startActivity(direct);
            toast("ส่ง Context ไป ChatGPT แล้ว — เลือกห้อง GO ที่ต้องการคุยต่อ");
        } catch (ActivityNotFoundException noChatGptShareTarget) {
            Intent chooser = Intent.createChooser(share, "ส่งต่อเข้า GO")
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                startActivity(chooser);
            } catch (ActivityNotFoundException noShareTarget) {
                toast("ไม่พบแอปที่รับ Context นี้ได้");
            }
        }
    }

    private void showError(String message) {
        setBubbleText("GO");
        closePanel(false);
        LinearLayout card = baseCard();
        card.addView(title("GO Sidecar · ERROR"));
        card.addView(body(message == null || message.isEmpty() ? "เกิดข้อผิดพลาด" : message));
        LinearLayout r = row();
        Button retry = button("ลองใหม่");
        Button settings = button("เปิดตั้งค่า");
        r.addView(retry, weight());
        r.addView(settings, weight());
        card.addView(r);
        Button close = button("ปิด");
        card.addView(close);
        retry.setOnClickListener(v -> askGo());
        settings.setOnClickListener(v -> startActivity(new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)));
        close.setOnClickListener(v -> closePanel(true));
        showPanel(card);
    }

    private LinearLayout baseCard() {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(14), dp(14), dp(14), dp(14));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.WHITE);
        bg.setCornerRadius(dp(18));
        bg.setStroke(dp(1), 0xffcbd5e1);
        card.setBackground(bg);
        return card;
    }

    private void showPanel(View content) {
        showPanel(content, false);
    }

    private void showPanel(View content, boolean fitContent) {
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(false);
        scroll.setClipToPadding(false);
        scroll.addView(content, new ScrollView.LayoutParams(-1, -2));
        panel = scroll;

        int panelWidth = Math.min(getResources().getDisplayMetrics().widthPixels - dp(24), dp(420));
        int screenHeight = getResources().getDisplayMetrics().heightPixels;
        int maxHeight = Math.max(dp(260), screenHeight - dp(120));
        int panelHeight = maxHeight;
        if (fitContent) {
            scroll.measure(
                    View.MeasureSpec.makeMeasureSpec(panelWidth, View.MeasureSpec.EXACTLY),
                    View.MeasureSpec.makeMeasureSpec(maxHeight, View.MeasureSpec.AT_MOST));
            panelHeight = Math.min(maxHeight, scroll.getMeasuredHeight());
        }
        WindowManager.LayoutParams p = new WindowManager.LayoutParams(
                panelWidth,
                panelHeight,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
                PixelFormat.TRANSLUCENT);
        p.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
        p.y = dp(56);
        p.softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE;
        wm.addView(panel, p);
    }

    private void closePanel(boolean deleteCapture) {
        if (panel != null) {
            try { wm.removeView(panel); } catch (Exception ignored) {}
            panel = null;
        }
        if (deleteCapture && currentCapture != null) {
            currentCapture.delete();
            currentCapture = null;
        }
    }

    private TextView title(String text) {
        TextView v = new TextView(this);
        v.setText(text);
        v.setTextSize(20);
        v.setTextColor(Color.BLACK);
        v.setTypeface(null, 1);
        v.setPadding(0, 0, 0, dp(8));
        return v;
    }

    private TextView body(String text) {
        TextView v = new TextView(this);
        v.setText(text);
        v.setTextSize(14);
        v.setTextColor(Color.DKGRAY);
        v.setPadding(0, dp(6), 0, dp(8));
        return v;
    }

    private LinearLayout row() {
        LinearLayout r = new LinearLayout(this);
        r.setOrientation(LinearLayout.HORIZONTAL);
        return r;
    }

    private LinearLayout.LayoutParams weight() {
        return new LinearLayout.LayoutParams(0, -2, 1f);
    }

    private LinearLayout.LayoutParams fullButton() {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
        params.setMargins(0, dp(2), 0, dp(2));
        return params;
    }

    private LinearLayout.LayoutParams pairWeight(boolean first) {
        LinearLayout.LayoutParams params = weight();
        params.setMargins(first ? 0 : dp(3), dp(2), first ? dp(3) : 0, dp(2));
        return params;
    }

    private void addButtonPair(LinearLayout card, Button first, Button second) {
        if (second == null) {
            card.addView(first, fullButton());
            return;
        }
        LinearLayout pair = row();
        pair.addView(first, pairWeight(true));
        pair.addView(second, pairWeight(false));
        card.addView(pair, new LinearLayout.LayoutParams(-1, -2));
    }

    private TextView sectionLabel(String text) {
        TextView label = new TextView(this);
        label.setText(text);
        label.setTextColor(0xff334155);
        label.setTextSize(13);
        label.setTypeface(null, 1);
        label.setPadding(dp(2), dp(10), 0, dp(3));
        return label;
    }

    private Button button(String text) {
        Button b = new Button(this);
        b.setText(text);
        b.setAllCaps(false);
        return b;
    }

    private void setBubbleText(String text) { if (bubble != null) bubble.setText(text); }
    private void toast(String s) { Toast.makeText(this, s, Toast.LENGTH_LONG).show(); }
    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }

    @Override
    public void onDestroy() {
        closePanel(true);
        removeBubble();
        worker.shutdownNow();
        stopForeground(STOP_FOREGROUND_REMOVE);
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }

    private final class BubbleTouch implements View.OnTouchListener {
        private int startX, startY;
        private float downX, downY;
        private long downAt;

        @Override
        public boolean onTouch(View v, MotionEvent e) {
            switch (e.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    startX = bubbleParams.x;
                    startY = bubbleParams.y;
                    downX = e.getRawX();
                    downY = e.getRawY();
                    downAt = System.currentTimeMillis();
                    return true;
                case MotionEvent.ACTION_MOVE:
                    bubbleParams.x = Math.max(0, startX - Math.round(e.getRawX() - downX));
                    bubbleParams.y = Math.max(0, startY + Math.round(e.getRawY() - downY));
                    wm.updateViewLayout(bubble, bubbleParams);
                    return true;
                case MotionEvent.ACTION_UP:
                    float dx = e.getRawX() - downX;
                    float dy = e.getRawY() - downY;
                    float distance = (float) Math.hypot(dx, dy);
                    long duration = System.currentTimeMillis() - downAt;
                    BubbleGesturePolicy.Action gesture = BubbleGesturePolicy.classify(
                            duration, distance, dp(10), MODE_LONG_PRESS_MS);
                    BubbleActionRouter.Target target = BubbleActionRouter.route(gesture);
                    if (target == BubbleActionRouter.Target.OPEN_MENU) showModeMenu();
                    else if (target == BubbleActionRouter.Target.ASK_GO) askGo();
                    return true;
                default:
                    return false;
            }
        }
    }
}
