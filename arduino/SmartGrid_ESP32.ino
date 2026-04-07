/**
 * SmartGrid ESP32 Firmware (V2 - Dynamic Voltage & 5V Supply)
 * 
 * Hardware Requirements:
 * - ESP32 Development Board
 * - SCT-013 Current Sensor (Non-invasive)
 * - ZMPT101B Voltage Sensor Module
 * - 8-Channel Relay Module (Active Low/High)
 * - 5V Power Supply (Crucial for sensor accuracy)
 * 
 * Libraries Required:
 * - Firebase ESP Client (by Mobizt)
 * - EmonLib (by OpenEnergyMonitor)
 */

#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include "EmonLib.h"

// 1. WiFi Credentials
#define WIFI_SSID "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"

// 2. Firebase Credentials
#define API_KEY "YOUR_FIREBASE_API_KEY"
#define DATABASE_URL "YOUR_RTDB_URL.firebaseio.com"

// 3. Hardware ID (MAC Address)
String hardwareId = ""; 

// 4. Pin Definitions
#define VOLTAGE_SENSOR_PIN 34 // ZMPT101B Analog Out
#define CURRENT_SENSOR_PIN 35 // SCT-013 Analog Out
const int RELAY_PINS[] = {13, 12, 14, 27, 26, 25, 33, 32};

// 5. Sensor Calibration
// Adjust these values using a multimeter for precision
float VOLT_CAL = 450.0; 
float CURR_CAL = 60.6;

EnergyMonitor emon1;
FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

unsigned long lastUpdate = 0;
bool signupOK = false;

// Power Calculation Function
struct PowerData {
  float voltage;
  float current;
  float power;
};

PowerData calculatePower() {
  // 20 half-wavelengths, 2000ms timeout
  emon1.calcVI(20, 2000); 
  
  PowerData data;
  data.voltage = emon1.Vrms;
  data.current = emon1.Irms;
  data.power   = emon1.realPower; // Vrms * Irms * PowerFactor
  
  // Safety check for noise
  if (data.current < 0.05) {
    data.current = 0;
    data.power = 0;
  }
  
  return data;
}

void setup() {
  Serial.begin(115200);
  
  // Relay Setup
  for (int i = 0; i < 8; i++) {
    pinMode(RELAY_PINS[i], OUTPUT);
    digitalWrite(RELAY_PINS[i], HIGH); // OFF
  }

  // Sensor Setup (5V Supply assumed for ZMPT101B)
  emon1.voltage(VOLTAGE_SENSOR_PIN, VOLT_CAL, 1.7);
  emon1.current(CURRENT_SENSOR_PIN, CURR_CAL);

  // WiFi Setup
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi Connected");

  hardwareId = WiFi.macAddress();
  hardwareId.replace(":", "");

  // Firebase Setup
  config.api_key = API_KEY;
  config.database_url = DATABASE_URL;

  if (Firebase.signUp(&config, &auth, "", "")) {
    signupOK = true;
  }

  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);

  // Relay Stream
  String path = "/hardware/" + hardwareId + "/devices";
  Firebase.RTDB.beginStream(&fbdo, path.c_str());
}

void loop() {
  // 1. Calculate and Send Power Data
  if (millis() - lastUpdate > 2000) {
    lastUpdate = millis();
    
    PowerData pData = calculatePower();
    
    if (Firebase.ready() && signupOK) {
      String basePath = "/hardware/" + hardwareId + "/grid";
      Firebase.RTDB.setFloat(&fbdo, (basePath + "/voltage").c_str(), pData.voltage);
      Firebase.RTDB.setFloat(&fbdo, (basePath + "/current").c_str(), pData.current);
      Firebase.RTDB.setFloat(&fbdo, (basePath + "/power").c_str(), pData.power);
      
      Serial.printf("V: %.1fV | I: %.2fA | P: %.1fW\n", pData.voltage, pData.current, pData.power);
    }
  }

  // 2. Listen for Relay Commands
  if (Firebase.ready() && signupOK) {
    if (Firebase.RTDB.readStream(&fbdo)) {
      if (fbdo.streamAvailable()) {
        String path = fbdo.dataPath();
        if (path.length() > 1) {
          int pin = path.substring(1).toInt();
          bool status = fbdo.boolData();
          digitalWrite(pin, status ? LOW : HIGH); // ON/OFF
        }
      }
    }
  }
}
