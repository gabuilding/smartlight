// =====================================================
// GA SMART LIGHT CONTROL
// Dashboard Controller - CLEAN MULTI DEVICE + WIFI CONFIG
// =====================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getDatabase,
    ref,
    onValue,
    set,
    update
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
    getAuth,
    signInAnonymously
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// =====================================================
// FIREBASE
// =====================================================

const firebaseConfig = {
    apiKey: "AIzaSyAaM6pTbpcXxnjaZ3g1--VCyehsQq-IT6w",
    authDomain: "smart-light-103b2.firebaseapp.com",
    databaseURL: "https://smart-light-103b2-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "smart-light-103b2",
    storageBucket: "smart-light-103b2.firebasestorage.app",
    messagingSenderId: "103463642286",
    appId: "1:103463642286:web:7148b57e61a6726f83f93f",
    measurementId: "G-NEF09WNBW7"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// =====================================================
// DOM
// =====================================================

const pjuLocation = document.getElementById("pjuLocation");
const deviceStatus = document.getElementById("deviceStatus");

const wifiSignal = document.getElementById("wifiSignal");
const wifiSSIDDropdown = document.getElementById("wifiSSIDDropdown");
const wifiDropdownMenu = document.getElementById("wifiDropdownMenu");
const wifiSSID = document.getElementById("wifiSSID");
const wifiNetworkList = document.getElementById("wifiNetworkList");
const wifiScanBtn = document.getElementById("wifiScanBtn");
const wifiPasswordSection = document.getElementById("wifiPasswordSection");
const wifiPassword = document.getElementById("wifiPassword");
const wifiPasswordToggle = document.getElementById("wifiPasswordToggle");
const wifiConnectBtn = document.getElementById("wifiConnectBtn");
const wifiConfigStatus = document.getElementById("wifiConfigStatus");
const rssiValue = document.getElementById("rssiValue");

const lampIndicator = document.getElementById("lampIndicator");
const lampStatusText = document.getElementById("lampStatusText");
const lampStatusBadge = document.getElementById("lampStatusBadge");

const modeValue = document.getElementById("modeValue");
const autoModeBtn = document.getElementById("autoModeBtn");
const manualModeBtn = document.getElementById("manualModeBtn");
const manualControl = document.getElementById("manualControl");
const lampOnBtn = document.getElementById("lampOnBtn");
const lampOffBtn = document.getElementById("lampOffBtn");

const onSchedule = document.getElementById("onSchedule");
const offSchedule = document.getElementById("offSchedule");
const onTimeInput = document.getElementById("onTimeInput");
const offTimeInput = document.getElementById("offTimeInput");
const saveScheduleBtn = document.getElementById("saveScheduleBtn");

const systemTime = document.getElementById("systemTime");
const systemDate = document.getElementById("systemDate");
const lastUpdate = document.getElementById("lastUpdate");

// =====================================================
// STATE
// =====================================================

let currentDeviceId = "";
let currentDeviceData = null;
let currentMode = "AUTO";
let currentLampStatus = false;
let lastSeenTimestamp = 0;

let selectedWifiSSID = "";

const DEVICE_TIMEOUT = 10;

let deviceListener = null;
let lampListener = null;
let scheduleListener = null;
let wifiScanListener = null;
let wifiConfigListener = null;

// =====================================================
// AUTH
// =====================================================

async function initializeAuthentication() {
    try {
        await signInAnonymously(auth);
        console.log("Firebase Anonymous Authentication berhasil.");
        initializeDeviceSelector();
    } catch (error) {
        console.error("Firebase Authentication gagal:", error);
        showFirebaseError(error);
    }
}

function showFirebaseError(error) {
    if (!deviceStatus) return;
    deviceStatus.textContent = "Offline";
    deviceStatus.classList.remove("online");
    deviceStatus.classList.add("offline");
    console.error(error);
}

// =====================================================
// CLOCK
// =====================================================

function updateSystemClock() {
    const now = new Date();

    if (systemTime) {
        systemTime.textContent = now.toLocaleTimeString("id-ID", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false
        });
    }

    if (systemDate) {
        systemDate.textContent = now.toLocaleDateString("id-ID", {
            weekday: "long",
            day: "2-digit",
            month: "long",
            year: "numeric"
        });
    }
}

updateSystemClock();
setInterval(updateSystemClock, 1000);

// =====================================================
// DEVICE SELECTOR
// =====================================================

function initializeDeviceSelector() {
    if (!pjuLocation) {
        selectDevice("pju_002");
        return;
    }

    onValue(ref(db, "devices"), snapshot => {
        const devices = snapshot.val() || {};
        const ids = Object.keys(devices).sort();

        const previous = currentDeviceId || pjuLocation.value;

        pjuLocation.innerHTML = "";

        if (ids.length === 0) {
            const option = document.createElement("option");
            option.value = "pju_002";
            option.textContent = "PJU Jalan Pabrik";
            pjuLocation.appendChild(option);
            selectDevice("pju_002");
            return;
        }

        ids.forEach(id => {
            const option = document.createElement("option");
            option.value = id;
            option.textContent = devices[id]?.name || id;
            pjuLocation.appendChild(option);
        });

        const selected = ids.includes(previous) ? previous : ids[0];
        pjuLocation.value = selected;
        selectDevice(selected);
    });

    pjuLocation.addEventListener("change", () => {
        selectDevice(pjuLocation.value);
    });
}

// =====================================================
// DEVICE SELECTION / RESET
// =====================================================

function selectDevice(deviceId) {
    if (!deviceId) return;
    if (deviceId === currentDeviceId && deviceListener) return;

    currentDeviceId = deviceId;
    currentDeviceData = null;
    currentMode = "AUTO";
    currentLampStatus = false;
    lastSeenTimestamp = 0;

    cleanupListeners();
    resetDeviceDisplay();

    attachDeviceListener();
    attachLampListener();
    attachScheduleListener();
    attachWifiListeners();

    updateDeviceOffline();
}

function cleanupListeners() {
    if (deviceListener) deviceListener();
    if (lampListener) lampListener();
    if (scheduleListener) scheduleListener();
    if (wifiScanListener) wifiScanListener();
    if (wifiConfigListener) wifiConfigListener();

    deviceListener = null;
    lampListener = null;
    scheduleListener = null;
    wifiScanListener = null;
    wifiConfigListener = null;
}

function resetDeviceDisplay() {
    selectedWifiSSID = "";

    if (deviceStatus) {
        deviceStatus.textContent = "Offline";
        deviceStatus.classList.remove("online", "offline");
        deviceStatus.classList.add("offline");
    }

    if (wifiSSID) wifiSSID.textContent = "-";
    if (rssiValue) rssiValue.textContent = "-";

    closeWifiDropdown();

    if (wifiNetworkList) {
        wifiNetworkList.innerHTML =
            '<div class="wifi-network-empty">Belum ada jaringan</div>';
    }

    if (wifiPassword) wifiPassword.value = "";
    if (wifiPasswordSection) wifiPasswordSection.classList.remove("show");

    setWifiStatus("", "");
    if (wifiConnectBtn) {
        wifiConnectBtn.disabled = false;
        wifiConnectBtn.innerHTML =
            '<i data-lucide="wifi"></i><span>Connect</span>';
    }

    updateLampDisplay(false);
    updateModeDisplay("AUTO");

    if (onSchedule) onSchedule.textContent = "18:00";
    if (offSchedule) offSchedule.textContent = "05:30";
    if (onTimeInput) onTimeInput.value = "18:00";
    if (offTimeInput) offTimeInput.value = "05:30";

    if (lastUpdate) lastUpdate.textContent = "Last update: --";
    refreshIcons();
}

// =====================================================
// DEVICE LISTENER
// =====================================================

function attachDeviceListener() {
    const target = ref(db, `devices/${currentDeviceId}`);

    deviceListener = onValue(target, snapshot => {
        const data = snapshot.val();

        currentDeviceData = data || null;

        if (!data) {
            lastSeenTimestamp = 0;
            updateDeviceOffline();
            updateWifiInfo("", null);
            return;
        }

        lastSeenTimestamp = Number(data.lastSeen || 0);

        updateWifiInfo(data.ssid, data.rssi);
        checkDeviceStatus();
        updateLastUpdate();
    });
}

// =====================================================
// LAMP LISTENER
// =====================================================

function attachLampListener() {
    const target = ref(db, `lamps/${currentDeviceId}`);

    lampListener = onValue(target, snapshot => {
        const data = snapshot.val();
        if (!data) return;

        currentMode = String(data.mode || "AUTO").toUpperCase();
        currentLampStatus = parseLampStatus(data.status);

        updateLampDisplay(currentLampStatus);
        updateModeDisplay(currentMode);
        updateLastUpdate();
    });
}

function parseLampStatus(value) {
    if (value === true || value === 1) return true;

    const normalized = String(value ?? "").trim().toUpperCase();

    return (
        normalized === "TRUE" ||
        normalized === "1" ||
        normalized === "ON"
    );
}

// =====================================================
// SCHEDULE LISTENER
// =====================================================

function attachScheduleListener() {
    const target = ref(db, `schedules/${currentDeviceId}`);

    scheduleListener = onValue(target, snapshot => {
        const data = snapshot.val() || {};

        const onTime = formatTime(
            Number(data.onHour ?? 18),
            Number(data.onMinute ?? 0)
        );

        const offTime = formatTime(
            Number(data.offHour ?? 5),
            Number(data.offMinute ?? 30)
        );

        if (onSchedule) onSchedule.textContent = onTime;
        if (offSchedule) offSchedule.textContent = offTime;
        if (onTimeInput) onTimeInput.value = onTime;
        if (offTimeInput) offTimeInput.value = offTime;

        updateLastUpdate();
    });
}

// =====================================================
// WIFI DROPDOWN
// =====================================================

function openWifiDropdown() {
    if (!wifiDropdownMenu || !wifiSSIDDropdown) return;

    wifiDropdownMenu.classList.add("show");
    wifiSSIDDropdown.classList.add("active");
}

function closeWifiDropdown() {
    if (!wifiDropdownMenu || !wifiSSIDDropdown) return;

    wifiDropdownMenu.classList.remove("show");
    wifiSSIDDropdown.classList.remove("active");
}

function toggleWifiDropdown() {
    if (!wifiDropdownMenu) return;

    if (wifiDropdownMenu.classList.contains("show")) {
        closeWifiDropdown();
    } else {
        openWifiDropdown();
    }
}

function selectWifiNetwork(ssid) {
    if (!ssid) return;

    selectedWifiSSID = ssid;

    if (wifiSSID) wifiSSID.textContent = ssid;

    if (wifiPasswordSection) {
        wifiPasswordSection.classList.add("show");
    }

    document.querySelectorAll(".wifi-network-item").forEach(item => {
        item.classList.toggle("selected", item.dataset.ssid === ssid);
    });

    closeWifiDropdown();

    if (wifiPassword) {
        wifiPassword.value = "";
        wifiPassword.focus();
    }

    setWifiStatus("", "");
}

// =====================================================
// WIFI SCAN
// =====================================================

async function requestWifiScan() {
    if (!currentDeviceId || !wifiScanBtn) return;

    wifiScanBtn.disabled = true;
    wifiScanBtn.classList.add("scanning");

    if (wifiNetworkList) {
        wifiNetworkList.innerHTML =
            '<div class="wifi-network-empty">Scanning Wi-Fi...</div>';
    }

    openWifiDropdown();

    try {
        await set(
            ref(db, `devices/${currentDeviceId}/wifiScanRequest`),
            Date.now().toString()
        );

        setWifiStatus("Scanning Wi-Fi...", "connecting");
    } catch (error) {
        console.error("Gagal meminta scan Wi-Fi:", error);

        if (wifiNetworkList) {
            wifiNetworkList.innerHTML =
                '<div class="wifi-network-empty">Scan gagal</div>';
        }

        setWifiStatus("Scan Wi-Fi gagal.", "error");
        finishWifiScan();
    }
}

function attachWifiScanListener() {
    const target = ref(db, `devices/${currentDeviceId}/wifiScan`);

    wifiScanListener = onValue(target, snapshot => {
        renderWifiScanResults(snapshot.val() || {});
        finishWifiScan();
    });
}

function renderWifiScanResults(data) {
    if (!wifiNetworkList) return;

    const networks = Object.values(data)
        .filter(item => item && item.ssid)
        .map(item => ({
            ssid: String(item.ssid),
            rssi: Number(item.rssi)
        }))
        .sort((a, b) => b.rssi - a.rssi);

    const unique = [];
    const seen = new Set();

    for (const network of networks) {
        if (seen.has(network.ssid)) continue;
        seen.add(network.ssid);
        unique.push(network);
    }

    if (unique.length === 0) {
        wifiNetworkList.innerHTML =
            '<div class="wifi-network-empty">Belum ada jaringan</div>';
        return;
    }

    wifiNetworkList.innerHTML = "";

    unique.forEach(network => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "wifi-network-item";
        button.dataset.ssid = network.ssid;

        const name = document.createElement("span");
        name.className = "wifi-network-name";
        name.textContent = network.ssid;

        const signal = document.createElement("span");
        signal.className = "wifi-network-rssi";
        signal.textContent = Number.isFinite(network.rssi)
            ? `${network.rssi} dBm`
            : "";

        button.append(name, signal);

        button.addEventListener("click", event => {
            event.stopPropagation();
            selectWifiNetwork(network.ssid);
        });

        wifiNetworkList.appendChild(button);
    });
}

function finishWifiScan() {
    if (!wifiScanBtn) return;

    wifiScanBtn.disabled = false;
    wifiScanBtn.classList.remove("scanning");
}

// =====================================================
// WIFI CONFIG
// =====================================================

const WIFI_CONNECT_TIMEOUT = 20000; // 20 detik
let wifiConnectTimer = null;

if (wifiPasswordToggle && wifiPassword) {
    wifiPasswordToggle.addEventListener("click", () => {

        const isPassword =
            wifiPassword.type === "password";

        wifiPassword.type =
            isPassword ? "text" : "password";

        wifiPasswordToggle.innerHTML =
            isPassword
                ? '<i data-lucide="eye-off"></i>'
                : '<i data-lucide="eye"></i>';

        wifiPasswordToggle.setAttribute(
            "aria-label",
            isPassword
                ? "Sembunyikan password"
                : "Lihat password"
        );

        wifiPasswordToggle.setAttribute(
            "title",
            isPassword
                ? "Sembunyikan password"
                : "Lihat password"
        );

        refreshIcons();
    });
}

document.addEventListener("click", (event) => {
    if (!wifiPasswordSection) return;

    // Kalau kotak password sedang tersembunyi, tidak perlu apa-apa
    if (!wifiPasswordSection.classList.contains("show")) {
        return;
    }

    // Klik masih di dalam kotak password → jangan tutup
    if (wifiPasswordSection.contains(event.target)) {
        return;
    }

    // Klik di luar → tutup
    wifiPasswordSection.classList.remove("show");

    // Sembunyikan password kembali
    if (wifiPassword) {
        wifiPassword.type = "password";
        wifiPassword.value = "";
    }

    // Reset ikon mata
    if (wifiPasswordToggle) {
        wifiPasswordToggle.innerHTML =
            '<i data-lucide="eye"></i>';

        wifiPasswordToggle.setAttribute(
            "aria-label",
            "Lihat password"
        );

        wifiPasswordToggle.setAttribute(
            "title",
            "Lihat password"
        );

        refreshIcons();
    }
});

//=====================================================
// UPDATE WIFI SIGNAL
//=====================================================

function updateWifiSignal(rssi, offline = false) {

    if (!wifiSignal) return;

    const bars =
        wifiSignal.querySelectorAll("i");

    // OFFLINE
    if (offline) {

        wifiSignal.classList.remove(
            "level-1",
            "level-2",
            "level-3",
            "level-4"
        );

        wifiSignal.classList.add("offline");

        return;
    }

    wifiSignal.classList.remove("offline");

    const numeric = Number(rssi);

    if (!Number.isFinite(numeric)) {
        wifiSignal.classList.remove(
            "level-1",
            "level-2",
            "level-3",
            "level-4"
        );

        return;
    }

    let level = 1;

    if (numeric >= -60) {
        level = 4;
    } else if (numeric >= -70) {
        level = 3;
    } else if (numeric >= -80) {
        level = 2;
    }

    wifiSignal.classList.remove(
        "level-1",
        "level-2",
        "level-3",
        "level-4"
    );

    wifiSignal.classList.add(
        `level-${level}`
    );
}

// =====================================================
// RESET CONNECT BUTTON
// =====================================================

function resetWifiConnectButton() {

    clearTimeout(wifiConnectTimer);
    wifiConnectTimer = null;

    if (!wifiConnectBtn) {
        return;
    }

    wifiConnectBtn.disabled = false;

    wifiConnectBtn.innerHTML =
        '<i data-lucide="wifi"></i><span>Connect</span>';

    refreshIcons();
}


// =====================================================
// WIFI CONFIG LISTENER
// =====================================================

function attachWifiConfigListener() {

    const target = ref(
        db,
        `devices/${currentDeviceId}/wifiConfig`
    );

    wifiConfigListener = onValue(
        target,
        snapshot => {

            const data =
                snapshot.val() || {};

            updateWifiConfigStatus(
                data.status,
                data.error
            );
        }
    );
}


// =====================================================
// UPDATE WIFI CONFIG STATUS
// =====================================================

function updateWifiConfigStatus(
    status,
    error
) {

    const normalized =
        String(status || "").toUpperCase();


    // ---------------------------------------------
    // EMPTY
    // ---------------------------------------------

    if (!normalized) {

        setWifiStatus("", "");

        resetWifiConnectButton();

        return;
    }


    // ---------------------------------------------
    // REQUESTED
    // ---------------------------------------------

    if (normalized === "REQUESTED") {

        setWifiStatus(
            "Permintaan Wi-Fi dikirim...",
            "info"
        );

        if (wifiConnectBtn) {

            wifiConnectBtn.disabled = true;

            wifiConnectBtn.innerHTML =
                '<i data-lucide="loader-circle"></i>' +
                '<span>Connecting...</span>';

            refreshIcons();
        }

        startWifiConnectTimeout();

        return;
    }


    // ---------------------------------------------
    // CONNECTING
    // ---------------------------------------------

    if (normalized === "CONNECTING") {

        setWifiStatus(
            "ESP32 sedang menghubungkan Wi-Fi...",
            "connecting"
        );

        if (wifiConnectBtn) {

            wifiConnectBtn.disabled = true;

            wifiConnectBtn.innerHTML =
                '<i data-lucide="loader-circle"></i>' +
                '<span>Connecting...</span>';

            refreshIcons();
        }

        startWifiConnectTimeout();

        return;
    }


    // ---------------------------------------------
    // CONNECTED
    // ---------------------------------------------

    if (normalized === "CONNECTED") {

    clearTimeout(wifiConnectTimer);
    wifiConnectTimer = null;

    setWifiStatus(
        "Wi-Fi berhasil terhubung.",
        "success"
    );

    // Kosongkan password
    if (wifiPassword) {
        wifiPassword.value = "";
    }

    // Sembunyikan password + tombol Connect
    if (wifiPasswordSection) {
        wifiPasswordSection.classList.remove("show");
    }

    // Reset tombol
    resetWifiConnectButton();

    return;
}

    // ---------------------------------------------
    // FAILED
    // ---------------------------------------------

    if (normalized === "FAILED") {

        clearTimeout(wifiConnectTimer);
        wifiConnectTimer = null;

        setWifiStatus(
            error
                ? `Gagal: ${error}`
                : "Koneksi Wi-Fi gagal.",
            "error"
        );

        resetWifiConnectButton();

        return;
    }


    // ---------------------------------------------
    // OTHER STATUS
    // ---------------------------------------------

    setWifiStatus(
        normalized,
        "info"
    );
}


// =====================================================
// WIFI CONNECT TIMEOUT
// =====================================================

function startWifiConnectTimeout() {

    clearTimeout(wifiConnectTimer);

    wifiConnectTimer = setTimeout(
        async () => {

            console.warn(
                "Wi-Fi connection timeout."
            );

            setWifiStatus(
                "Koneksi timeout. Silakan coba lagi.",
                "error"
            );

            resetWifiConnectButton();

            /*
             * Jangan langsung menghapus wifiConfig
             * atau password dari Firebase.
             *
             * Kita hanya membuka kembali tombol
             * di dashboard.
             */

        },
        WIFI_CONNECT_TIMEOUT
    );
}


// =====================================================
// CONNECT TO WIFI
// =====================================================

async function connectToWifi() {

    if (!currentDeviceId) {

        setWifiStatus(
            "Device belum dipilih.",
            "error"
        );

        return;
    }


    const ssid =
        selectedWifiSSID.trim();

    const password =
        wifiPassword?.value ?? "";


    // ---------------------------------------------
    // CEK SSID
    // ---------------------------------------------

    if (!ssid) {

        setWifiStatus(
            "Pilih jaringan Wi-Fi terlebih dahulu.",
            "error"
        );

        openWifiDropdown();

        return;
    }


    try {

        // -----------------------------------------
        // DISABLE BUTTON
        // -----------------------------------------

        wifiConnectBtn.disabled = true;

        wifiConnectBtn.innerHTML =
            '<i data-lucide="loader-circle"></i>' +
            '<span>Connecting...</span>';

        refreshIcons();


        // -----------------------------------------
        // REQUEST ID
        // -----------------------------------------

        const requestId =
            `${Date.now()}_${Math.random()
                .toString(36)
                .slice(2, 8)}`;


        // -----------------------------------------
        // START TIMEOUT
        // -----------------------------------------

        startWifiConnectTimeout();


        // -----------------------------------------
        // SEND TO FIREBASE
        // -----------------------------------------

        await update(
            ref(
                db,
                `devices/${currentDeviceId}/wifiConfig`
            ),
            {
                ssid,
                password,
                requestId,
                status: "REQUESTED",
                error: ""
            }
        );


        console.log(
            "Wi-Fi configuration request sent:",
            ssid,
            requestId
        );

    }

    catch (error) {

        console.error(
            "Gagal mengirim konfigurasi Wi-Fi:",
            error
        );

        clearTimeout(
            wifiConnectTimer
        );

        wifiConnectTimer = null;

        setWifiStatus(
            "Gagal mengirim konfigurasi Wi-Fi.",
            "error"
        );

        resetWifiConnectButton();
    }
}

// =====================================================
// WIFI INFO / ONLINE STATUS
// =====================================================

function updateWifiInfo(ssid, rssi) {

    const actualSSID = ssid
        ? String(ssid)
        : "-";

    // SSID dari Firebase adalah SSID yang benar-benar
    // sedang digunakan oleh ESP32.
    if (wifiSSID) {
        wifiSSID.textContent = actualSSID;
    }

    // RSSI tetap mengikuti ESP32
    if (rssiValue) {
        const numeric = Number(rssi);

        rssiValue.textContent =
            Number.isFinite(numeric)
                ? `${numeric} dBm`
                : "-";
    }

    updateWifiSignal(rssi);

    // Jika ESP32 sudah benar-benar pindah ke SSID yang dipilih user, hapus pilihan sementara.
    if (
        selectedWifiSSID &&
        actualSSID === selectedWifiSSID
    ) {
        selectedWifiSSID = "";
    }
}

function checkDeviceStatus() {
    if (!lastSeenTimestamp) {
        updateDeviceOffline();
        return;
    }

    const now = Math.floor(Date.now() / 1000);
    const elapsed = now - lastSeenTimestamp;

    if (elapsed >= 0 && elapsed <= DEVICE_TIMEOUT) {
        updateDeviceOnline();
    } else {
        updateDeviceOffline();
    }
}

function updateDeviceOnline() {
    if (!deviceStatus) return;

    deviceStatus.textContent = "Online";
    deviceStatus.classList.remove("offline");
    deviceStatus.classList.add("online");
}

function updateDeviceOffline() {
    if (!deviceStatus) return;

    deviceStatus.textContent = "Offline";
    deviceStatus.classList.remove("online");
    deviceStatus.classList.add("offline");

    updateWifiSignal(null, true);
}

setInterval(checkDeviceStatus, 1000);

// =====================================================
// LAMP / MODE
// =====================================================

function updateLampDisplay(status) {
    if (lampIndicator) {
        lampIndicator.classList.toggle("on", status);
        lampIndicator.classList.toggle("off", !status);
    }

    if (lampStatusText) {
        lampStatusText.textContent = status ? "ON" : "OFF";
    }

    if (lampStatusBadge) {
        lampStatusBadge.textContent = status ? "ON" : "OFF";
        lampStatusBadge.classList.toggle("on", status);
        lampStatusBadge.classList.toggle("off", !status);
    }
}

function updateModeDisplay(mode) {
    const normalized = String(mode || "AUTO").toUpperCase();

    if (modeValue) {
        modeValue.textContent =
            normalized === "AUTO" ? "AUTO" : "MANUAL";
    }

    if (autoModeBtn) {
        autoModeBtn.classList.toggle(
            "active",
            normalized === "AUTO"
        );
    }

    if (manualModeBtn) {
        manualModeBtn.classList.toggle(
            "active",
            normalized !== "AUTO"
        );
    }

    if (manualControl) {
        manualControl.style.display =
            normalized === "AUTO" ? "none" : "block";
    }

    if (lampOnBtn) {
        lampOnBtn.classList.toggle(
            "active",
            normalized === "MANUAL_ON"
        );
    }

    if (lampOffBtn) {
        lampOffBtn.classList.toggle(
            "active",
            normalized === "MANUAL_OFF"
        );
    }
}

async function setMode(mode) {
    if (!currentDeviceId) return;

    try {
        await set(
            ref(db, `lamps/${currentDeviceId}/mode`),
            mode
        );
    } catch (error) {
        console.error("Gagal mengubah mode:", error);
        alert("Gagal mengubah mode.");
    }
}

autoModeBtn?.addEventListener("click", () => setMode("AUTO"));

manualModeBtn?.addEventListener("click", () => {
    setMode(currentLampStatus ? "MANUAL_ON" : "MANUAL_OFF");
});

lampOnBtn?.addEventListener("click", () => setMode("MANUAL_ON"));
lampOffBtn?.addEventListener("click", () => setMode("MANUAL_OFF"));

// =====================================================
// SCHEDULE
// =====================================================

function formatTime(hour, minute) {
    return (
        String(hour).padStart(2, "0") +
        ":" +
        String(minute).padStart(2, "0")
    );
}

async function saveSchedule() {
    if (!currentDeviceId || !onTimeInput || !offTimeInput) return;

    const onValue = onTimeInput.value;
    const offValue = offTimeInput.value;

    if (!onValue || !offValue) {
        alert("Waktu ON dan OFF harus diisi.");
        return;
    }

    const [onHour, onMinute] = onValue.split(":").map(Number);
    const [offHour, offMinute] = offValue.split(":").map(Number);

    const originalHTML = saveScheduleBtn.innerHTML;

    saveScheduleBtn.disabled = true;
    saveScheduleBtn.innerHTML =
        '<i data-lucide="loader-circle"></i>';
    refreshIcons();

    try {
        await update(
            ref(db, `schedules/${currentDeviceId}`),
            {
                onHour,
                onMinute,
                offHour,
                offMinute
            }
        );

        if (onSchedule) onSchedule.textContent = onValue;
        if (offSchedule) offSchedule.textContent = offValue;

        saveScheduleBtn.innerHTML =
            '<i data-lucide="check"></i>';
        refreshIcons();

        updateLastUpdate();

        setTimeout(() => {
            saveScheduleBtn.innerHTML = originalHTML;
            saveScheduleBtn.disabled = false;
            refreshIcons();
        }, 1200);

    } catch (error) {
        console.error("Gagal menyimpan jadwal:", error);
        alert("Gagal menyimpan jadwal ke Firebase.");

        saveScheduleBtn.innerHTML = originalHTML;
        saveScheduleBtn.disabled = false;
        refreshIcons();
    }
}

saveScheduleBtn?.addEventListener("click", saveSchedule);

// =====================================================
// HELPERS
// =====================================================

function setWifiStatus(message, type) {
    if (!wifiConfigStatus) return;

    wifiConfigStatus.textContent = message || "";
    wifiConfigStatus.className = "wifi-config-status";

    if (message && type) {
        wifiConfigStatus.classList.add(type);
    }
}

function updateLastUpdate() {
    if (!lastUpdate) return;

    lastUpdate.textContent =
        `Last update: ${new Date().toLocaleTimeString("id-ID", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false
        })}`;
}

function refreshIcons() {
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

function clearWifiSelection() {
    selectedWifiSSID = "";

    if (wifiSSID) wifiSSID.textContent = "-";
    if (wifiPassword) wifiPassword.value = "";
    if (wifiPasswordSection) {
        wifiPasswordSection.classList.remove("show");
    }

    closeWifiDropdown();
}

function setupWifiEvents() {
    wifiSSIDDropdown?.addEventListener("click", event => {
        event.stopPropagation();
        toggleWifiDropdown();
    });

    wifiScanBtn?.addEventListener("click", event => {
        event.stopPropagation();
        requestWifiScan();
    });

    wifiConnectBtn?.addEventListener("click", connectToWifi);

    document.addEventListener("click", event => {
        if (
            wifiDropdownMenu &&
            wifiSSIDDropdown &&
            !wifiDropdownMenu.contains(event.target) &&
            !wifiSSIDDropdown.contains(event.target)
        ) {
            closeWifiDropdown();
        }
    });
}

function attachWifiListeners() {
    attachWifiScanListener();
    attachWifiConfigListener();
}

// =====================================================
// START
// =====================================================

refreshIcons();
setupWifiEvents();
initializeAuthentication();

console.log("GA Smart Light Control Dashboard siap.");

// =====================================================
// AUTO RELOAD PAGE
// =====================================================

const AUTO_RELOAD_INTERVAL = 5 * 60 * 1000;

setTimeout(() => {

    const overlay =
        document.getElementById("refreshOverlay");

    if (overlay) {
        overlay.classList.add("show");
    }

    setTimeout(() => {
        window.location.reload();
    }, 2000);

}, AUTO_RELOAD_INTERVAL);