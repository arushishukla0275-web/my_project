import numpy as np
import pandas as pd
import joblib
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, roc_auc_score

def generate_altitude_hardware_data(n_samples=5000, random_state=42):
    np.random.seed(random_state)
    
    # Feature ranges representative of Leh / Siachen operational zones
    altitude_m = np.random.uniform(500, 6500, n_samples)          # Altitude in meters
    ambient_temp_c = np.random.uniform(-40, 35, n_samples)        # Outside Air Temp
    load_current_a = np.random.uniform(2.0, 50.0, n_samples)       # System Load Current
    vibration_g = np.random.uniform(0.1, 5.0, n_samples)          # Physical Stress
    operating_hours = np.random.uniform(10, 5000, n_samples)      # Cumulative wear
    
    # Derived Physics Calculations
    # 1. Barometric formula for pressure (kPa)
    pressure_kpa = 101.325 * (1 - 2.25577e-5 * altitude_m)**5.25588
    
    # 2. Air density relative factor (derating cooling capability)
    air_density_ratio = pressure_kpa / 101.325
    
    # 3. Internal component temp (less heat dissipation at low density)
    internal_temp_c = ambient_temp_c + (load_current_a**1.4 * 0.8) / np.sqrt(air_density_ratio)
    
    # 4. Arcing probability index (Paschen's law proxy for gap ionization)
    dielectric_margin = pressure_kpa / (1.0 + (load_current_a / 10.0))
    
    # Failure Logic Rules (Target Label Generation)
    # 0 = Normal, 1 = Warning, 2 = Critical Failure Risk
    risk_score = np.zeros(n_samples)
    
    # Severe thermal breakdown or dielectric flashover
    critical_mask = (internal_temp_c > 105) | (dielectric_margin < 18) | (ambient_temp_c < -30)
    # Moderate degradation
    warning_mask = (internal_temp_c > 85) | (dielectric_margin < 30) | (vibration_g > 3.8)
    
    risk_score[warning_mask] = 1
    risk_score[critical_mask] = 2
    
    # Introduce 3% real-world sensor noise
    noise_indices = np.random.choice(n_samples, size=int(0.03 * n_samples), replace=False)
    risk_score[noise_indices] = np.random.choice([0, 1, 2], size=len(noise_indices))

    df = pd.DataFrame({
        'altitude_m': np.round(altitude_m, 1),
        'ambient_temp_c': np.round(ambient_temp_c, 1),
        'pressure_kpa': np.round(pressure_kpa, 2),
        'load_current_a': np.round(load_current_a, 2),
        'vibration_g': np.round(vibration_g, 2),
        'operating_hours': np.round(operating_hours, 1),
        'internal_temp_c': np.round(internal_temp_c, 1),
        'dielectric_margin': np.round(dielectric_margin, 2),
        'health_status': risk_score.astype(int)
    })
    
    return df

# Build Dataset
print("Generating high-altitude telemetry dataset...")
df = generate_altitude_hardware_data()
df.to_csv("high_altitude_telemetry.csv", index=False)

# Features & Targets
X = df.drop(columns=['health_status'])
y = df['health_status']

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

# Model Training
model = RandomForestClassifier(n_estimators=150, max_depth=10, random_state=42)
model.fit(X_train, y_train)

# Evaluation
y_pred = model.predict(X_test)
print("\n--- Model Evaluation ---")
print(classification_report(y_test, y_pred, target_names=['Normal', 'Warning', 'Critical']))

# Export Artifacts for Dashboard API
joblib.dump(model, "altitude_model.pkl")
print("Model saved to altitude_model.pkl and dataset saved to high_altitude_telemetry.csv")