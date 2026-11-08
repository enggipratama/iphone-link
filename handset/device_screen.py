"""Device screen dimensions for adaptive window sizing."""

from __future__ import annotations

# Logical screen dimensions (points)
DEVICE_DIMENSIONS: dict[str, tuple[int, int]] = {
    # iPhone 15 series
    "iPhone16,1": (393, 852),   # 15 Pro
    "iPhone16,2": (430, 932),   # 15 Pro Max
    "iPhone15,4": (393, 852),   # 15
    "iPhone15,5": (430, 932),   # 15 Plus
    # iPhone 14 series
    "iPhone15,2": (393, 852),   # 14 Pro
    "iPhone15,3": (430, 932),   # 14 Pro Max
    "iPhone14,7": (390, 844),   # 14
    "iPhone14,8": (428, 926),   # 14 Plus
    # iPhone 13 series
    "iPhone14,2": (390, 844),   # 13 Pro
    "iPhone14,3": (428, 926),   # 13 Pro Max
    "iPhone14,5": (390, 844),   # 13
    "iPhone14,4": (375, 812),   # 13 mini
    # iPhone 12 series
    "iPhone13,3": (390, 844),   # 12 Pro
    "iPhone13,4": (428, 926),   # 12 Pro Max
    "iPhone13,2": (390, 844),   # 12
    "iPhone13,1": (375, 812),   # 12 mini
    # iPad Pro 11"
    "iPad14,3": (834, 1194),
    "iPad14,4": (834, 1194),
    "iPad13,4": (834, 1194),
    "iPad13,5": (834, 1194),
    # iPad Pro 12.9"
    "iPad14,5": (1024, 1366),
    "iPad14,6": (1024, 1366),
    "iPad13,8": (1024, 1366),
    "iPad13,9": (1024, 1366),
    # iPad Air
    "iPad13,16": (820, 1180),
    "iPad13,17": (820, 1180),
    # iPad mini
    "iPad14,1": (744, 1133),
    "iPad14,2": (744, 1133),
}

DEFAULT_DIMENSIONS = (390, 844)

def get_dimensions(product_type: str | None) -> tuple[int, int]:
    if not product_type:
        return DEFAULT_DIMENSIONS
    return DEVICE_DIMENSIONS.get(product_type, DEFAULT_DIMENSIONS)

def is_ipad(product_type: str | None) -> bool:
    return product_type.startswith("iPad") if product_type else False
