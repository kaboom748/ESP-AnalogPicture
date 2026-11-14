# ESP-AnalogPicture
"The longer you wait, the better the image will become...."
<img width="1411" height="860" alt="fffff" src="https://github.com/user-attachments/assets/07da97f0-0864-47d1-883d-31d2b556cc79" />
<img width="1419" height="820" alt="Capture d’écran 2026-11-13 213122" src="https://github.com/user-attachments/assets/8c39bf15-10c1-4bcf-8cb8-49f6d0436dc1" />

# CB-IMAGE/1024 — Analog Still-Image Accumulator

An experimental **1024 × 768 still-picture analog FM transmitter and receiver** built around the **unchanged CB FM STEREO V12 ESP8266 firmware**. A browser converts a JPEG, PNG, frozen webcam frame or test pattern into a continuous, repeatedly transmitted PCM8 raster. The receiver reconstructs the image immediately, accumulates repeated sweeps, and averages independent noise while avoiding incorrectly positioned line/sector samples.

**This is experimental, not a standards-compliant analog TV format or a certified RF transmitter. No RF hardware validation has yet been performed for this particular 1024 × 768 application.**

## Downloads / project files

- `index.html` — browser UI (serve this folder on `http://localhost` if permissions require it).
- `CB_IMAGE_1024_STANDALONE.html` — equivalent single-file browser interface, containing its JavaScript and CSS.
- `image-codec.js` — analog raster, excessive synchronization, YUV packing and averaging.
- `app.js` — image import, Web Serial V12 TX/RX control and visual diagnostics.
- `CB_FM_STEREOv12_Arduino/` — **original V12 firmware, unmodified** (ten source files).
- `tests/` — Node.js and simulated-browser tests; no RF measurements.
- `GUIDE_FR.md` — short setup instructions in French.

## Hardware and environment

Two compatible ESP8266 boards, each running the **CB FM STEREO V12** Arduino firmware at **160 MHz**, with a USB-serial bridge capable of **2,000,000 baud 8N1**. A computer running Chrome or Edge and this HTML application is needed at **each end**. There is one transmitting board and one receiving board: the original V12 RF link is **simplex**, not simultaneously bidirectional.

Choose a legally permitted 2.4 GHz frequency and test in a suitable RF-shielded or attenuated arrangement when evaluating new waveforms. Transmit power and frequency settings are *not* compliance guarantees.

## How to use

1. Flash each ESP8266 with the provided **original V12 firmware** if it is not already running. Use 160 MHz CPU mode. There is **no modified image-specific INO**.
2. On both PCs, open `CB_IMAGE_1024_STANDALONE.html` in desktop Chrome/Edge. If local browser permissions cause trouble, serve the project directory locally (`python -m http.server 8000`) and open `http://localhost:8000/`.
3. Select the **same mode** (`YUV 4:4:4`, `YUV 4:2:0`, or monochrome) and RF frequency on both pages.
4. On the transmitter, select **Transmitter**, load a JPEG/PNG, click **Freeze webcam**, or select the test pattern. A source is scaled to fit within 1024×768 without cropping, and kept static.
5. Click **Connect USB serial** on both PCs. The page checks the V12 `STATUS` reply and requests `RX ... HQ` at 120,000 samples/s. The transmitter then clicks **Transmit image continuously**.
6. On the receiver, choose **Accumulated image** (default) or **Latest received samples**. Good-looking portions appear while the *first* sweep is still arriving. Later sweeps improve the average if their noise is sufficiently independent.
7. **Save accumulated PNG** at any time. Use **Clear accumulated image** to start over. If the photo source changes, a new in-band picture ID tells the receiver to reset automatically (unless disabled).

**Both browser pages must use this version of the picture protocol**; it is incompatible with CB-VIDEO V8 video raster layouts. The **ESP8266 firmware, serial commands and MPX3 receive frames are unchanged**.

## Exact transmitted modes at 120,000 PCM samples/s

| Mode | Component dimensions | Time per repeated sweep | H tags / sweep | 64-pixel segment tags / sweep |
| --- | --- | ---: | ---: | ---: |
| YUV 4:4:4 HQ (default) | Y/U/V 1024×768 each | **63.9012 seconds** | 2,304 | 36,864 |
| YUV 4:2:0 | Y 1024×768; U/V 512×384 | **32.5668 seconds** | 1,536 | 18,432 |
| Monochrome | Y 1024×768 | **21.3028 seconds** | 768 | 12,288 |

**All modes use 2 PCM samples per image component value**, plus additional sync/ID samples. The quoted time includes all marker overhead and is longer than the unmarked analog pixel duration. The input and display support 8 bits per Y, U, V component; 4:2:0 reduces chroma spatial detail. Reserved extremes on the actual analog PCM waveform limit the available voltage range, and true over-air effective color precision is not yet measured.

## Deliberately abundant synchronization

A robust *analog* waveform has many **out-of-picture marker samples** so damaged picture content can be skipped without shifting the accumulation grid:

- **V marker once per sweep**: three long LOW/HIGH pulses, followed by a **24-bit in-band sync header** identifying the image (16 bits), the format (2 bits) and six tag check bits. Only picture identity/sync metadata are tagged; there is no video CRC.
- **H marker at the start of EVERY physical Y/U/V scan line**: three repeated LOW/HIGH pairs, a redundantly sampled 16-bit tag containing the 2-bit plane number, the 10-bit absolute row number, and four marker check bits; followed by **black/white references**.
- **Section marker every 64 pixels in EVERY line**: a three-pulse LOW/HIGH/LOW pattern, a 6-bit tag containing the *absolute* sector number (0–15 for full-width YUV 4:4:4), and a black porch. This is **16 section markers per full-resolution line**.

The line and segment tags are short analog level sequences occupying separate waveform slots. Their checks prevent a badly received sync tag from relocating good pixels. They do **not** check or correct the image values. A marker can still be corrupted beyond recognition; the relevant section is then *not added to the running average*. Reception automatically resumes at the next correctly positioned section or line. The receiver can start mid-sweep because each accepted line/section carries its own position.

### On-air waveform levels (signed PCM8 values)

| Purpose | Nominal PCM value |
| --- | ---: |
| Reserved synchronization LOW / HIGH | −118 / +118 |
| Marker ID bits LOW / HIGH | −104 / +104 |
| Black/white reference porch | −76 / +76 |
| Image component range | −64 … +64 |
| RX firmware unavailable-sample sentinel | −128 (`0x80`) |

The two samples per picture value are dithered in complementary half-step combinations, so the **average of the pair** offers finer level spacing than a single limited-range PCM value. Actual FM fidelity depends on the radio, its filters and the channel.

## Receiver averaging and rejection

The receiver stores separate floating-point running means and observation counts for Y, U and V. For each correctly tagged section:

- Values already flagged as unavailable by the V12 demodulator are **not** added.
- A heavily corrupted or displaced section may be **skipped entirely** if enough pixels disagree strongly with the existing mean.
- Once a pixel has multiple previous observations, extreme new outliers may be skipped according to the **Outlier rejection** slider.
- Otherwise, observations update an incremental arithmetic mean; no FEC, pixel CRC or retransmission is used.

The **Raw** view shows the latest accepted pixel observations, whereas the **Accumulated** view shows the running mean. An empty or badly synchronized sector does not overwrite the existing accumulated photo. The RX renders incrementally instead of waiting for a complete new image.

If noise is independent and zero-mean, the standard deviation ideally decreases as `1/sqrt(number of observations)`; four good passes would reduce random noise by ~2×, sixteen by ~4×. This is *not* guaranteed when interference, dropped segments or analog distortions are correlated between passes. Averaging cannot recover spatial information removed by RF filtering, nor correct a persistently shifted or systematically distorted signal.

## Diagnostics

The UI displays line markers, 64-pixel segment markers, frame markers, accumulated pixel observations, rejected sectors, MPX3 missing samples, estimated serial TX/RX sample throughput and the maximum observed USB scheduling lateness.

If H and sector tags remain near zero while picture noise appears, check **frequency, profile HQ, transmit selection, marker levels and actual USB PCM reception**. If tag counts advance but pixels do not accumulate, verify that **the selected YUV mode matches on both ends**, and inspect the rejection threshold. A mismatch between image-ID tags and format selection blocks mixing of YUV planes.

## Important limitations

1. **Not independently RF-tested.** The JavaScript waveform and V12 serial protocol were exercised in simulation and a browser mock; real over-air performance depends on two physical ESP8266 boards and the receive demodulator.
2. **Long sweep times.** Full-resolution 4:4:4 takes ~64 s per picture, before many minutes of accumulating multiple passages. The first complete high-quality image is **not instant**.
3. **Spectrum/bandwidth is not guaranteed.** Sending 2 PCM samples/value at 120 ksample/s may exceed the real *flat* analog bandwidth of the V12 RF demodulator. Nominal 1024×768 sample positions do not guarantee 1024 independently resolved horizontal details.
4. **Browser/USB scheduling can introduce bursts of missing data.** Original V12 TX RAM is 16 KiB (~136 ms at 120 ksample/s). Web Serial at 2 Mbaud has adequate *nominal average throughput*, but does not guarantee deterministic timing. The firmware may output silence during TX underrun; extra markers cannot recreate missing samples.
5. **No promises of perfect synchronization.** Headers can be lost, falsely detected or distorted; the small tag checks reduce but do not eliminate the possibility of incorrect placement. Use the counters, first with a test pattern.
6. **No pixel correction or reliable file transfer.** This is a noisy analog image channel with **averaging and statistical outlier rejection**, not AX.25, SSTV, JPEG file transport or a replacement for packet radio.
7. **No video-style automatic RF/USB repair.** V12's unmodified MPX3 protocol still frames 128 samples with an index and has no image CRC or retransmissions. Lost data cannot be reconstructed from the transport alone.
8. **Webcam capture is a *single frozen frame*.** A new picture may require stopping TX and loading another one. This is not a live video codec.
9. **Original firmware licensing.** Check the upstream project rights before redistributing. This repository does not invent or assert a new upstream firmware license.

## Verification performed (software only)

- Exhaustive clean-waveform reconstruction for all three modes (1024×768), with correctly indexed line and section sync.
- Repeated independent noise, attenuation, DC offset and >10,000 missing PCM samples: receiver reacquires, keeps the absolute pixel positions and the running mean reduces error.
- Noise-only input does not produce valid line/picture tags in the test.
- Browser UI and simulated original V12 `STATUS` → `STOP` → `RX ... HQ` → `TX` commands; TX PCM and MPX3 RX frames exercised.
- SHA-256 equality of all ten packaged Arduino V12 files against the selected original V12 source archive.

Re-run tests with Node.js (`node tests/test_codec.cjs`, `node tests/test_resync.cjs`) and Python/Playwright (`python tests/test_browser.py`, `python tests/test_serial_browser.py`) when your environment supports Chromium.

**No real two-radio, real-waveform, RF-bandwidth, spectral-mask or long-duration stability test has been completed.**



