import cv2
import time

RTSP_URL = "rtsp://localhost:8554/webcam"

print(f"Connecting to {RTSP_URL} ...")
cap = cv2.VideoCapture(RTSP_URL)

if not cap.isOpened():
    print("Error: Could not open video stream.")
    exit()

print("Stream opened. Press 'q' to quit.")

while True:
    start_time = time.time()
    ret, frame = cap.read()
    
    if not ret:
        print("Error: Frame read failed or stream ended.")
        break

    # Add a timestamp so you can wave your hand and see the latency
    cv2.putText(frame, f"Latency Test - {time.strftime('%H:%M:%S')}", 
                (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)

    cv2.imshow('RTSP Stream Viewer', frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
