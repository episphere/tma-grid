import tensorflow as tf
import numpy as np
import json
import os
from tensorflow.keras.preprocessing.image import load_img, img_to_array

# Function to resize labels
def resize_labels(labels, original_size, new_size):
    # Adjust the label coordinates for the new image size
    scale_x = new_size[1] / original_size[1]
    scale_y = new_size[0] / original_size[0]
    resized_labels = []
    for label in labels:
        resized_label = {
            'x': label['x'] * scale_x,
            'y': label['y'] * scale_y,
            'radius': label['radius'] * scale_x  # Assuming uniform scaling in x and y
        }
        resized_labels.append(resized_label)
    return resized_labels


# Function to convert labels to EfficientDet format
def convert_to_efficientdet_format(labels, image_shape):
    efficientdet_labels = []
    for label in labels:
        # Calculate the coordinates of the upper left and lower right corners
        xmin = (label['x'] - label['radius']) / image_shape[1]
        ymin = (label['y'] - label['radius']) / image_shape[0]
        xmax = (label['x'] + label['radius']) / image_shape[1]
        ymax = (label['y'] + label['radius']) / image_shape[0]
        # EfficientDet format [ymin, xmin, ymax, xmax]
        efficientdet_labels.append([
            max(0, ymin), max(0, xmin), min(1, ymax), min(1, xmax)
        ])
    return efficientdet_labels


# Function to load images and labels
def load_images_and_labels(image_dir, label_dir, original_size=(1024, 1024), new_size=(512, 512)):
    image_files = [os.path.join(image_dir, file) for file in sorted(os.listdir(image_dir)) if file.endswith('.png')]
    label_files = [os.path.join(label_dir, file) for file in sorted(os.listdir(label_dir)) if file.endswith('.json')]
    
    images = []
    all_boxes = []

    for image_file, label_file in zip(image_files, label_files):
        # Load and resize image
        image = load_img(image_file, color_mode='rgb', target_size=new_size)
        # Convert the image to an array and scale the pixel values to [-1, 1]
        image = (img_to_array(image) / 127.5) - 1
        images.append(image)

        # Load labels and adjust for new image size
        with open(label_file, 'r') as file:
            json_data = json.load(file)
        resized_json_data = resize_labels(json_data, original_size=original_size, new_size=new_size)
        boxes = convert_to_efficientdet_format(resized_json_data, new_size)
        all_boxes.append(boxes)
    
    return np.array(images), all_boxes


# Function to pad labels to a fixed size
def pad_labels(labels, max_boxes=100, pad_value=0):
    padded_labels = []
    for label in labels:
        padded_label = np.zeros((max_boxes, 4), dtype=np.float32) + pad_value
        num_boxes = min(len(label), max_boxes)
        padded_label[:num_boxes] = label[:num_boxes]
        padded_labels.append(padded_label)
    return np.array(padded_labels)

# Function to prepare the dataset
def prepare_dataset(images, boxes, batch_size):
    # Create a dataset of images and boxes
    images = tf.constant(images, dtype=tf.float32)
    boxes = pad_labels(boxes)
    boxes = tf.constant(boxes, dtype=tf.float32)
    
    # Create class labels (all ones, since we only have one class)
    class_labels = tf.ones_like(boxes[..., :1], dtype=tf.int32)  # EfficientDet expects class labels to start from 1
    
    # Slice the dataset
    dataset = tf.data.Dataset.from_tensor_slices((images, boxes, class_labels))
    dataset = dataset.shuffle(len(images)).batch(batch_size).prefetch(tf.data.AUTOTUNE)
    return dataset

batch_size = 2
image_dir = './TMA_WSI_Padded_PNGs'
label_dir = './TMA_WSI_Labels_updated'
images, boxes = load_images_and_labels(image_dir, label_dir)
# Map this preprocessing function to your dataset
dataset = prepare_dataset(images, boxes, batch_size)

import tensorflow as tf
from tensorflow.keras import layers, models

def create_object_detection_model(num_classes, num_boxes):
    # Define the backbone
    backbone = tf.keras.applications.MobileNetV2(input_shape=[512, 512, 3], include_top=False, weights='imagenet')
    backbone.trainable = False  # Optional: Freeze the backbone layers

    # Add layers for object detection on top of the backbone
    x = backbone.output
    x = layers.Conv2D(256, kernel_size=(3, 3), activation='relu', padding='same')(x)
    x = layers.Conv2D(128, kernel_size=(3, 3), activation='relu', padding='same')(x)
    x = layers.Conv2D(64, kernel_size=(3, 3), activation='relu', padding='same')(x)
    x = layers.GlobalAveragePooling2D()(x)
    
    # Outputs for bounding box predictions and class predictions
    boxes_output = layers.Dense(num_boxes * 4, activation='sigmoid', name='boxes_output')(x)  # Each box has 4 coordinates
    class_output = layers.Dense(num_boxes * num_classes, activation='softmax', name='class_output')(x)  # Multi-class classification for each box

    # Construct the final model
    model = models.Model(inputs=backbone.input, outputs=[boxes_output, class_output])
    
    return model

# Assuming we have only one class for object detection and 100 boxes per image
num_classes = 1  # Adjust the number of classes based on your dataset
num_boxes = 100  # Maximum number of boxes per image, adjust as needed
model = create_object_detection_model(num_classes, num_boxes)