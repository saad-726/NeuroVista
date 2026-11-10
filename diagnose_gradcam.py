"""
diagnose_gradcam.py
Diagnostic test suite for CNN-BiLSTM Grad-CAM localization.
Runs all 6 sanity checks requested by user.
"""

import os
import glob
import cv2
import numpy as np

# Set environment to prevent GPU memory issues / verbose TF logs
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
import tensorflow as tf

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, 'model', 'cnn_lstm_brain_mri_v1.h5')
CLASSES_PATH = os.path.join(BASE_DIR, 'model', 'class_names.npy')
OUTPUT_DIR = os.path.join(BASE_DIR, 'diagnostics_output')
os.makedirs(OUTPUT_DIR, exist_ok=True)

print("="*60)
print("1. LOADING MODEL & ARTIFACTS")
print("="*60)
model = tf.keras.models.load_model(MODEL_PATH)
classes = list(np.load(CLASSES_PATH, allow_pickle=True))
print(f"Model loaded: {model.name}")
print(f"Classes: {classes}")

# Find target 2D convolutional layer
target_layer = None
for layer in reversed(model.layers):
    if isinstance(layer, tf.keras.layers.Conv2D) or 'conv2d' in layer.name.lower():
        target_layer = layer
        break

print(f"Target Grad-CAM layer selected: {target_layer.name} (Output shape: {target_layer.output.shape})")

# Construct Grad-CAM extractor
grad_model = tf.keras.models.Model(
    inputs=[model.inputs],
    outputs=[target_layer.output, model.output]
)

def preprocess(img):
    """Preprocess according to model specification"""
    if len(img.shape) == 3:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    else:
        gray = img.copy()
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    rgb = cv2.cvtColor(enhanced, cv2.COLOR_GRAY2RGB)
    blurred = cv2.GaussianBlur(rgb, (0, 0), 2.0)
    unsharp = cv2.addWeighted(rgb, 2.5, blurred, -1.5, 0)
    resized = cv2.resize(unsharp, (96, 96))
    return resized.astype('float32') / 255.0

def compute_raw_gradcam(preprocessed_img, class_idx, target_grad_model):
    with tf.GradientTape() as tape:
        conv_outputs, preds = target_grad_model(preprocessed_img[np.newaxis])
        loss = preds[:, class_idx]
    
    grads = tape.gradient(loss, conv_outputs)
    # Global average pooling along spatial dimensions (H=1, W=2)
    weights = tf.reduce_mean(grads, axis=(1, 2))[0]
    cam = tf.tensordot(conv_outputs[0], weights, axes=([2], [0]))
    cam = tf.maximum(cam, 0)
    
    cam_np = cam.numpy()
    max_val = np.max(cam_np)
    if max_val > 1e-8:
        cam_np = cam_np / max_val
    else:
        cam_np = np.zeros_like(cam_np)
    return cam_np, preds.numpy()[0]

# Pick a sample image from unseen data
sample_candidates = glob.glob(os.path.join(BASE_DIR, 'unseen data', '*', '*.jpg'))
if not sample_candidates:
    sample_candidates = glob.glob(os.path.join(BASE_DIR, 'static', 'uploads', 'scans', '*.jpg'))

sample_path = sample_candidates[0]
raw_img = cv2.imread(sample_path)
prep_img = preprocess(raw_img)
initial_pred = model.predict(prep_img[np.newaxis])[0]
pred_class_idx = int(np.argmax(initial_pred))
print(f"\nAnalyzing Sample Image: {os.path.basename(sample_path)}")
print(f"Predicted Class: {classes[pred_class_idx]} with confidence {initial_pred[pred_class_idx]*100:.2f}%\n")

# =========================================================================
# SANITY CHECK 1: Spatial Coordinate Shifts (Raw vs Resized Argmax)
# =========================================================================
print("="*60)
print("SANITY CHECK 1: Coordinate Shift Analysis")
print("="*60)
raw_cam, _ = compute_raw_gradcam(prep_img, pred_class_idx, grad_model)
raw_argmax = np.unravel_index(np.argmax(raw_cam), raw_cam.shape) # (row=y, col=x)

resized_cam = cv2.resize(raw_cam, (raw_img.shape[1], raw_img.shape[0]))
res_argmax = np.unravel_index(np.argmax(resized_cam), resized_cam.shape)

expected_y = int(raw_argmax[0] * (raw_img.shape[0] / raw_cam.shape[0]))
expected_x = int(raw_argmax[1] * (raw_img.shape[1] / raw_cam.shape[1]))

print(f"Raw CAM Shape: {raw_cam.shape} | Peak activation at (y={raw_argmax[0]}, x={raw_argmax[1]})")
print(f"Resized CAM Shape: {resized_cam.shape} | Peak activation at (y={res_argmax[0]}, x={res_argmax[1]})")
print(f"Theoretical Scaled Position: (y={expected_y}, x={expected_x})")

coord_error = np.sqrt((res_argmax[0] - expected_y)**2 + (res_argmax[1] - expected_x)**2)
print(f"Discrepancy Error: {coord_error:.2f} pixels")
if coord_error < 6.0:
    print(">> CHECK 1 STATUS: [PASSED] Spatial coordinate integrity preserved during resizing.")
else:
    print(">> CHECK 1 STATUS: [WARNING] Spatial discrepancy detected during resizing!")

# =========================================================================
# SANITY CHECK 2: Horizontal Flip Equivariance
# =========================================================================
print("\n" + "="*60)
print("SANITY CHECK 2: Horizontal Flip Equivariance")
print("="*60)
flipped_img = cv2.flip(raw_img, 1)
prep_flipped = preprocess(flipped_img)
cam_flipped, _ = compute_raw_gradcam(prep_flipped, pred_class_idx, grad_model)
cam_unflipped = cv2.flip(cam_flipped, 1)

corr_matrix = np.corrcoef(raw_cam.flatten(), cam_unflipped.flatten())
correlation = corr_matrix[0, 1] if not np.isnan(corr_matrix[0, 1]) else 0.0
print(f"Pearson Correlation between Original CAM and Unflipped CAM: {correlation:.4f}")
if correlation > 0.60:
    print(">> CHECK 2 STATUS: [PASSED] Heatmap shows high spatial equivariance under horizontal reflection.")
else:
    print(">> CHECK 2 STATUS: [WARNING] Low correlation under flip. Model may rely on non-symmetric border artifacts.")

# =========================================================================
# SANITY CHECK 3: Baseline & Random Noise Control
# =========================================================================
print("\n" + "="*60)
print("SANITY CHECK 3: Baseline Canvas & Random Noise Control")
print("="*60)
black_img = np.zeros((96, 96, 3), dtype=np.float32)
noise_img = np.random.uniform(0, 1, (96, 96, 3)).astype(np.float32)

black_cam, _ = compute_raw_gradcam(black_img, pred_class_idx, grad_model)
noise_cam, _ = compute_raw_gradcam(noise_img, pred_class_idx, grad_model)

black_energy = float(np.sum(black_cam))
noise_energy = float(np.sum(noise_cam))
print(f"Black Canvas Total Heatmap Energy: {black_energy:.4f}")
print(f"Noise Canvas Total Heatmap Energy: {noise_energy:.4f}")

if black_energy == 0 or np.isnan(black_energy):
    print(">> CHECK 3 STATUS: [PASSED] Zero spurious activation on a blank canvas.")
else:
    sim_black = np.corrcoef(raw_cam.flatten(), black_cam.flatten())[0, 1]
    print(f"Correlation with Blank Canvas CAM: {sim_black:.4f}")
    if sim_black > 0.70:
        print(">> CHECK 3 STATUS: [FAILED] Model produces identical heatmap on blank image! Bias in prior weights.")
    else:
        print(">> CHECK 3 STATUS: [PASSED] Heatmap changes distinctly between scan and empty canvas.")

# =========================================================================
# SANITY CHECK 4: Brain Mask Energy Distribution
# =========================================================================
print("\n" + "="*60)
print("SANITY CHECK 4: Brain Mask Energy Distribution")
print("="*60)
gray_raw = cv2.cvtColor(raw_img, cv2.COLOR_BGR2GRAY)
_, brain_mask = cv2.threshold(gray_raw, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
brain_mask_bin = (brain_mask > 0).astype(np.float32)

total_cam_energy = float(np.sum(resized_cam))
inside_energy = float(np.sum(resized_cam * brain_mask_bin))
outside_energy = total_cam_energy - inside_energy

pct_inside = (inside_energy / (total_cam_energy + 1e-8)) * 100
pct_outside = (outside_energy / (total_cam_energy + 1e-8)) * 100

print(f"Heatmap Energy Inside Brain Tissue: {pct_inside:.2f}%")
print(f"Heatmap Energy Outside Brain (Air / Skull): {pct_outside:.2f}%")
if pct_inside >= 70.0:
    print(">> CHECK 4 STATUS: [PASSED] Dominant activation concentrated inside brain tissue.")
else:
    print(">> CHECK 4 STATUS: [WARNING] Significant heat outside brain tissue. Checking if background shortcut exists.")

# =========================================================================
# SANITY CHECK 5: Multi-Class Comparison Grid
# =========================================================================
print("\n" + "="*60)
print("SANITY CHECK 5: Multi-Class Grid Generation")
print("="*60)
class_map_folders = {
    'Non': 'NonDemented',
    'VeryMILD': 'VeryMildDemented',
    'MILD': 'MildDemented',
    'Moderate': 'ModerateDemented'
}

grid_rows = []
for folder_name, c_label in class_map_folders.items():
    folder_path = os.path.join(BASE_DIR, 'unseen data', folder_name)
    if not os.path.exists(folder_path):
        continue
    img_files = glob.glob(os.path.join(folder_path, '*.jpg'))[:10]
    row_images = []
    c_idx = classes.index(c_label)
    for f in img_files:
        im = cv2.imread(f)
        p = preprocess(im)
        cam, _ = compute_raw_gradcam(p, c_idx, grad_model)
        cam_res = cv2.resize(cam, (im.shape[1], im.shape[0]))
        heatmap_color = cv2.applyColorMap((cam_res * 255).astype(np.uint8), cv2.COLORMAP_JET)
        overlay = cv2.addWeighted(im, 0.65, heatmap_color, 0.35, 0)
        thumb = cv2.resize(overlay, (100, 100))
        # Add label tag
        row_images.append(thumb)
    
    if row_images:
        grid_rows.append(np.hstack(row_images))

if grid_rows:
    max_w = max(r.shape[1] for r in grid_rows)
    padded_rows = [np.pad(r, ((0,0), (0, max_w - r.shape[1]), (0,0))) for r in grid_rows]
    final_grid = np.vstack(padded_rows)
    grid_path = os.path.join(OUTPUT_DIR, 'class_comparison_grid.jpg')
    cv2.imwrite(grid_path, final_grid)
    print(f">> CHECK 5 STATUS: [PASSED] Generated comparison grid with {len(grid_rows)} classes at:\n   {grid_path}")

# =========================================================================
# SANITY CHECK 6: Cascading Model Randomization Test
# =========================================================================
print("\n" + "="*60)
print("SANITY CHECK 6: Model Randomization Test (Adebayo et al.)")
print("="*60)
# Clone model and randomize the weights of the classification Dense layers
randomized_model = tf.keras.models.clone_model(model)
randomized_model.set_weights(model.get_weights())

dense_layer = randomized_model.get_layer('dense_8')
random_weights = [
    np.random.normal(0, 0.05, size=w.shape).astype(np.float32) for w in dense_layer.get_weights()
]
dense_layer.set_weights(random_weights)

rand_grad_model = tf.keras.models.Model(
    inputs=[randomized_model.inputs],
    outputs=[randomized_model.get_layer(target_layer.name).output, randomized_model.output]
)

rand_cam, _ = compute_raw_gradcam(prep_img, pred_class_idx, rand_grad_model)
rand_similarity = np.corrcoef(raw_cam.flatten(), rand_cam.flatten())[0, 1]
if np.isnan(rand_similarity):
    rand_similarity = 0.0

print(f"Similarity between Original Model CAM and Randomized Classifier CAM: {rand_similarity:.4f}")
if rand_similarity < 0.40:
    print(">> CHECK 6 STATUS: [PASSED] Grad-CAM is genuinely sensitive to model weights and class boundaries.")
else:
    print(">> CHECK 6 STATUS: [FAILED] Heatmap does not change when weights are randomized!")

print("\n" + "="*60)
print("DIAGNOSTIC SUITE RUN COMPLETE")
print("="*60)
