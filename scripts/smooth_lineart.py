"""Smooth SVG curves using Potrace's stable C API (development tooling only).

Requires the system libpotrace library (Debian/Ubuntu: libpotrace0). The Android
app consumes the resulting SVG/JSON files and has no native tracing dependency.
"""

from __future__ import annotations

import ctypes as C
import ctypes.util
from functools import lru_cache

import numpy as np


class Point(C.Structure):
    _fields_ = [("x", C.c_double), ("y", C.c_double)]


class Curve(C.Structure):
    _fields_ = [("n", C.c_int), ("tag", C.POINTER(C.c_int)),
                ("c", C.POINTER(Point * 3))]


class Path(C.Structure):
    pass


Path._fields_ = [("area", C.c_int), ("sign", C.c_int), ("curve", Curve),
                ("next", C.POINTER(Path)), ("childlist", C.POINTER(Path)),
                ("sibling", C.POINTER(Path)), ("priv", C.c_void_p)]


class State(C.Structure):
    _fields_ = [("status", C.c_int), ("plist", C.POINTER(Path)), ("priv", C.c_void_p)]


class Progress(C.Structure):
    _fields_ = [("callback", C.c_void_p), ("data", C.c_void_p),
                ("min", C.c_double), ("max", C.c_double), ("epsilon", C.c_double)]


class Parameters(C.Structure):
    _fields_ = [("turdsize", C.c_int), ("turnpolicy", C.c_int),
                ("alphamax", C.c_double), ("opticurve", C.c_int),
                ("opttolerance", C.c_double), ("progress", Progress)]


class Bitmap(C.Structure):
    _fields_ = [("w", C.c_int), ("h", C.c_int), ("dy", C.c_int),
                ("map", C.POINTER(C.c_ulong))]


@lru_cache(maxsize=1)
def library():
    name = ctypes.util.find_library("potrace")
    if not name:
        raise RuntimeError("Bezier tracing requires libpotrace (Debian/Ubuntu: install libpotrace0)")
    lib = C.CDLL(name)
    lib.potrace_param_default.restype = C.POINTER(Parameters)
    lib.potrace_param_default.argtypes = []
    lib.potrace_param_free.argtypes = [C.POINTER(Parameters)]
    lib.potrace_param_free.restype = None
    lib.potrace_trace.argtypes = [C.POINTER(Parameters), C.POINTER(Bitmap)]
    lib.potrace_trace.restype = C.POINTER(State)
    lib.potrace_state_free.argtypes = [C.POINTER(State)]
    lib.potrace_state_free.restype = None
    return lib


def smooth_path(mask: np.ndarray, scale: float, offset: tuple[float, float]) -> str:
    """Fit cubic curves while retaining corners and every compound-path hole."""
    lib = library()
    h, w = mask.shape
    word_bytes = C.sizeof(C.c_ulong)
    word_bits = word_bytes * 8
    stride = (w + word_bits - 1) // word_bits
    padded = np.pad(mask, ((0, 0), (0, stride * word_bits - w)))
    packed = np.packbits(padded, axis=1, bitorder="big")
    words = np.frombuffer(packed.tobytes(), dtype=f">u{word_bytes}").astype(f"u{word_bytes}")
    bitmap = Bitmap(w, h, stride, words.ctypes.data_as(C.POINTER(C.c_ulong)))
    parameters = lib.potrace_param_default()
    if not parameters:
        raise MemoryError("Could not allocate tracing parameters")
    state = None
    try:
        parameters.contents.turdsize = 1
        parameters.contents.alphamax = 1.0
        parameters.contents.opttolerance = .15
        state = lib.potrace_trace(parameters, C.byref(bitmap))
        if not state or state.contents.status != 0:
            raise RuntimeError("Bezier tracing could not finish this region")
        result = []
        current = state.contents.plist

        def point(p: Point) -> str:
            return f"{p.x * scale + offset[0]:.2f} {p.y * scale + offset[1]:.2f}"

        while current:
            curve = current.contents.curve
            if curve.n:
                result.append("M" + point(curve.c[curve.n - 1][2]))
                for i in range(curve.n):
                    controls = curve.c[i]
                    if curve.tag[i] == 1:  # POTRACE_CURVETO
                        result.append("C" + " ".join(point(p) for p in controls))
                    elif curve.tag[i] == 2:  # POTRACE_CORNER
                        result.append("L" + point(controls[1]) + "L" + point(controls[2]))
                    else:
                        raise RuntimeError("Unknown curve segment type")
                result.append("Z")
            current = current.contents.next
        return "".join(result)
    finally:
        if state:
            lib.potrace_state_free(state)
        lib.potrace_param_free(parameters)
