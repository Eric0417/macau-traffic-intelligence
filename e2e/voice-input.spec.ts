import { expect, test } from "@playwright/test";
import { meta, mockDashboard } from "./fixtures";

test.use({ reducedMotion: "reduce" });

test("the bus catalogue opens the assistant and transcribed audio stays editable until submitted", async ({ page }) => {
  const transcript = "我想由关闸搭巴士去妈阁庙。";
  const question = "我想由關閘搭巴士去媽閣廟。";
  const questions: string[] = [];
  let recordings = 0;
  await mockDashboard(page);
  await page.addInitScript(() => {
    // Feed an oscillator through the real Web Audio path without a hardware microphone.
    MediaDevices.prototype.getUserMedia = async () => {
      const context = new AudioContext();
      const destination = context.createMediaStreamDestination();
      const oscillator = context.createOscillator();
      oscillator.connect(destination);
      oscillator.start();
      const track = destination.stream.getAudioTracks()[0];
      const stop = track.stop.bind(track);
      track.stop = () => { stop(); void context.close(); };
      await context.resume();
      return destination.stream;
    };
  });
  await page.route("**/api/v1/assistant/transcribe", route => {
    recordings++;
    const audio = route.request().postDataBuffer()!;
    expect(route.request().headers()["content-type"]).toBe("audio/wav");
    expect(audio.subarray(0, 4).toString()).toBe("RIFF");
    expect(audio.readUInt16LE(22)).toBe(1);
    expect(audio.readUInt32LE(24)).toBe(16_000);
    expect(audio.readUInt32LE(40)).toBe(audio.length - 44);
    expect(audio.subarray(44).some(byte => byte !== 0)).toBe(true);
    return route.fulfill({ json: { data: { text: transcript } } });
  });
  await page.route("**/api/v1/assistant/journeys", route => {
    questions.push(route.request().postDataJSON().question);
    return route.fulfill({ json: { data: { kind: "clarify", message: "請確認出發地點。" }, meta: meta({ id: "assistant", name: "Test assistant", url: "https://example.com" }) } });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "語音輸入", exact: true }).click();
  await expect(page.getByRole("button", { name: "停止錄音", exact: true })).toBeVisible();
  await page.locator(".voice-feedback").getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.locator(".voice-feedback")).toHaveCount(0);
  expect(recordings).toBe(0);
  await page.getByRole("tab", { name: "巴士", exact: true }).click();
  await expect(page.getByRole("searchbox", { name: "搜尋路線號", exact: true })).toBeVisible();
  await expect(page.locator(".journey-planner")).toBeHidden();
  await page.getByRole("button", { name: "用 AI 助手規劃行程", exact: true }).click();
  const input = page.locator(".assistant-form textarea");
  await expect(input).toBeFocused();
  await page.getByRole("button", { name: "語音輸入", exact: true }).click();
  await expect(page.locator(".voice-feedback")).toContainText("DeepSeek");
  const stop = page.getByRole("button", { name: "停止錄音", exact: true });
  await expect(stop).toBeVisible();
  await page.waitForTimeout(350); // Let the fixture microphone feed several render blocks.
  await stop.click();
  await expect(input).toHaveValue(transcript);
  expect(recordings).toBe(1);
  expect(questions).toEqual([]);
  await input.fill(question);
  await page.getByRole("button", { name: "發問", exact: true }).click();
  await expect(page.getByText("請確認出發地點。")).toBeVisible();
  expect(questions).toEqual([question]);
});

test("denied microphone access leaves the home draft and submit control usable", async ({ page }) => {
  await mockDashboard(page);
  await page.addInitScript(() => {
    MediaDevices.prototype.getUserMedia = async () => { throw new DOMException("Denied", "NotAllowedError"); };
  });
  await page.goto("/");
  const draft = page.locator("#home-question");
  await draft.fill("去媽閣廟");
  await page.getByRole("button", { name: "語音輸入", exact: true }).click();
  await expect(page.locator(".voice-feedback")).toContainText("未能使用咪高峰");
  await expect(draft).toHaveValue("去媽閣廟");
  await expect(page.getByRole("button", { name: "發問", exact: true })).toBeEnabled();
});
