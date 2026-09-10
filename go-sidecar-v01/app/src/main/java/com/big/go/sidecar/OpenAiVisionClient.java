package com.big.go.sidecar;

import android.util.Base64;

import com.big.go.sidecar.core.GoPrompt;
import com.big.go.sidecar.core.ModelTextJsonExtractor;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

final class OpenAiVisionClient {
    private static final String ENDPOINT = "https://api.openai.com/v1/responses";
    private static final String MODEL = "gpt-5.6-luna";

    private OpenAiVisionClient() {}

    static GoResult analyze(File png, String apiKey, String latestIntent) throws Exception {
        byte[] imageBytes = readAll(new FileInputStream(png));
        String imageDataUrl = "data:image/png;base64," + Base64.encodeToString(imageBytes, Base64.NO_WRAP);

        JSONObject body = new JSONObject();
        body.put("model", MODEL);
        body.put("max_output_tokens", 900);

        JSONArray content = new JSONArray();
        content.put(new JSONObject().put("type", "input_text").put("text", GoPrompt.build(latestIntent)));
        content.put(new JSONObject().put("type", "input_image").put("image_url", imageDataUrl).put("detail", "high"));

        JSONArray input = new JSONArray();
        input.put(new JSONObject().put("role", "user").put("content", content));
        body.put("input", input);

        HttpURLConnection c = (HttpURLConnection) new URL(ENDPOINT).openConnection();
        c.setRequestMethod("POST");
        c.setConnectTimeout(30_000);
        c.setReadTimeout(90_000);
        c.setDoOutput(true);
        c.setRequestProperty("Authorization", "Bearer " + apiKey);
        c.setRequestProperty("Content-Type", "application/json");
        byte[] payload = body.toString().getBytes(StandardCharsets.UTF_8);
        c.setFixedLengthStreamingMode(payload.length);
        try (OutputStream os = c.getOutputStream()) {
            os.write(payload);
        }

        int status = c.getResponseCode();
        InputStream stream = status >= 200 && status < 300 ? c.getInputStream() : c.getErrorStream();
        String raw = readText(stream);
        if (status < 200 || status >= 300) {
            String safeMessage = "OpenAI API ตอบ " + status;
            try {
                JSONObject error = new JSONObject(raw).optJSONObject("error");
                if (error != null && !error.optString("message").isEmpty()) safeMessage += ": " + error.optString("message");
            } catch (Exception ignored) {}
            throw new IllegalStateException(safeMessage);
        }

        JSONObject response = new JSONObject(raw);
        String outputText = extractOutputText(response);
        String jsonText = ModelTextJsonExtractor.extract(outputText);
        if (jsonText == null) return new GoResult("UNKNOWN", outputText, "โมเดลไม่ได้คืน JSON ตามสัญญา");
        JSONObject result = new JSONObject(jsonText);
        return new GoResult(result.optString("kind", "UNKNOWN"), result.optString("draft", ""), result.optString("reason", ""));
    }

    private static String extractOutputText(JSONObject response) {
        StringBuilder out = new StringBuilder();
        JSONArray items = response.optJSONArray("output");
        if (items == null) return "";
        for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.optJSONObject(i);
            if (item == null) continue;
            JSONArray content = item.optJSONArray("content");
            if (content == null) continue;
            for (int j = 0; j < content.length(); j++) {
                JSONObject part = content.optJSONObject(j);
                if (part != null && "output_text".equals(part.optString("type"))) {
                    if (out.length() > 0) out.append('\n');
                    out.append(part.optString("text"));
                }
            }
        }
        return out.toString();
    }

    private static byte[] readAll(InputStream in) throws Exception {
        try (InputStream input = in; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = input.read(buf)) >= 0) out.write(buf, 0, n);
            return out.toByteArray();
        }
    }

    private static String readText(InputStream in) throws Exception {
        if (in == null) return "";
        try (BufferedReader br = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
            StringBuilder s = new StringBuilder();
            String line;
            while ((line = br.readLine()) != null) s.append(line);
            return s.toString();
        }
    }
}
