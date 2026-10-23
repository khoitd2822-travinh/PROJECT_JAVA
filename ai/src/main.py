from pathlib import Path
from tkinter import Tk, filedialog
from ultralytics import YOLO

projectPath = Path(__file__).resolve().parent.parent
modelPath = projectPath / "models" / "best.pt"

print("Dang nap model...")
model = YOLO(str(modelPath))
print("Da nap model thanh cong!")

root = Tk()
root.withdraw()
root.attributes("-topmost", True)

imagePath = filedialog.askopenfilename(
    parent=root,
    title="Chon anh de AI nhan dien",
    filetypes=[
        ("Anh", "*.jpg *.jpeg *.png *.bmp *.webp"),
        ("Tat ca tep", "*.*")
    ]
)

root.destroy()

if not imagePath:
    print("Chua chon anh.")
    raise SystemExit

print("Dang nhan dien anh...")
results = model.predict(
    source=imagePath,
    conf=0.25,
    save=True,
    show=False
)

for result in results:
    for box in result.boxes:
        classId = int(box.cls[0])
        className = model.names[classId]
        confidence = float(box.conf[0])
        print(f"{className}: {confidence:.2%}")

    resultImagePath = result.save_dir
    print("Thu muc ket qua:", resultImagePath)

print("Nhan dien hoan tat!")