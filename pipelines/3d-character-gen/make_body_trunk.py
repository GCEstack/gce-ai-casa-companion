"""Create body_trunk.png = body mask MINUS left_wing + right_wing.
Gives us a body silhouette without the spread wings baked in, so when the
wing layers rotate in the rig, we don't see the static wings double-rendered
behind them.
"""
import sys
sys.stdout.reconfigure(encoding="utf-8")

from pathlib import Path
import numpy as np
from PIL import Image

L = Path(r"C:\Claude\Personal\casa-companion\static\images\tv\corvo\layers")

body = np.array(Image.open(L / "body.png").convert("RGBA"))
lw = np.array(Image.open(L / "left_wing.png").convert("RGBA"))
rw = np.array(Image.open(L / "right_wing.png").convert("RGBA"))

wing_alpha = np.maximum(lw[..., 3], rw[..., 3])
# Where wings are opaque, knock body alpha to zero. Small feathering band
# where wings transition so we don't get a hard subtraction edge.
trunk_alpha = np.where(wing_alpha > 30, 0, body[..., 3]).astype(np.uint8)

body[..., 3] = trunk_alpha
Image.fromarray(body).save(L / "body_trunk.png")

opq_before = (body[..., 3] > 20).sum()
print(f"body_trunk.png saved. {opq_before/body[...,3].size*100:.1f}% opaque")
