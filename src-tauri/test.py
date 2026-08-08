import tkinter as tk
from tkinter import messagebox


def on_button_click(button_name):
    """Handle button clicks"""
    messagebox.showinfo("Button Clicked", f"You clicked: {button_name}")


def on_quit():
    """Close the application"""
    root.destroy()


# Create the main window
root = tk.Tk()
root.title("Simple Tkinter GUI")
root.geometry("300x200")
root.resizable(False, False)

# Create a frame for buttons
button_frame = tk.Frame(root)
button_frame.pack(expand=True, pady=20)

# Create buttons
btn1 = tk.Button(button_frame, text="Button 1", width=15, height=2,
                 command=lambda: on_button_click("Button 1"))
btn1.grid(row=0, column=0, padx=10, pady=5)

btn2 = tk.Button(button_frame, text="Button 2", width=15, height=2,
                 command=lambda: on_button_click("Button 2"))
btn2.grid(row=0, column=1, padx=10, pady=5)

btn3 = tk.Button(button_frame, text="Button 3", width=15, height=2,
                 command=lambda: on_button_click("Button 3"))
btn3.grid(row=1, column=0, padx=10, pady=5)

btn4 = tk.Button(button_frame, text="Button 4", width=15, height=2,
                 command=lambda: on_button_click("Button 4"))
btn4.grid(row=1, column=1, padx=10, pady=5)

# Quit button at the bottom
quit_btn = tk.Button(root, text="Quit", width=15, height=1, bg="#ff6b6b", fg="white",
                     command=on_quit)
quit_btn.pack(side=tk.BOTTOM, pady=15)

# Start the main event loop
root.mainloop()