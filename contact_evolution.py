"""Audio and visual generator based on contact evolution simulations."""

from __future__ import annotations

import argparse
import math
import os
import random
import struct
import wave
from dataclasses import dataclass
from typing import Iterable, List, Sequence, Tuple


@dataclass
class Contact:
    """A single contact in the evolution simulation."""

    identifier: int
    x: float
    y: float
    vx: float
    vy: float
    affinity: float


@dataclass
class Snapshot:
    """State of the simulation at a point in time."""

    time: float
    contacts: Tuple[Contact, ...]
    energy: float


class EvolutionSimulation:
    """Models contact evolution through attraction/repulsion dynamics."""

    def __init__(
        self,
        contacts: Sequence[Contact],
        bounds: Tuple[float, float] = (1.0, 1.0),
        damping: float = 0.98,
        random_seed: int | None = None,
    ) -> None:
        self._contacts = [Contact(**contact.__dict__) for contact in contacts]
        self._width, self._height = bounds
        self._damping = damping
        self._time = 0.0
        self._rng = random.Random(random_seed)

    @property
    def time(self) -> float:
        return self._time

    @property
    def contacts(self) -> Tuple[Contact, ...]:
        return tuple(self._contacts)

    def step(self, dt: float = 0.02) -> Snapshot:
        """Advance the simulation by one time step."""

        forces = [(0.0, 0.0) for _ in self._contacts]
        for i, contact in enumerate(self._contacts):
            for j in range(i + 1, len(self._contacts)):
                other = self._contacts[j]
                dx = other.x - contact.x
                dy = other.y - contact.y
                distance = math.hypot(dx, dy) + 1e-6
                direction_x = dx / distance
                direction_y = dy / distance
                affinity = (contact.affinity + other.affinity) * 0.5
                influence = affinity / (distance * distance)
                if distance < 0.2:
                    influence *= -1.5
                fx = direction_x * influence
                fy = direction_y * influence
                forces[i] = (forces[i][0] + fx, forces[i][1] + fy)
                forces[j] = (forces[j][0] - fx, forces[j][1] - fy)

        for idx, contact in enumerate(self._contacts):
            fx, fy = forces[idx]
            contact.vx = (contact.vx + fx * dt) * self._damping
            contact.vy = (contact.vy + fy * dt) * self._damping
            contact.x += contact.vx * dt
            contact.y += contact.vy * dt
            contact.x, contact.vx = self._apply_bounds(contact.x, contact.vx, self._width)
            contact.y, contact.vy = self._apply_bounds(contact.y, contact.vy, self._height)

        self._time += dt
        energy = sum(math.hypot(c.vx, c.vy) for c in self._contacts)
        return Snapshot(time=self._time, contacts=self.contacts, energy=energy)

    def _apply_bounds(self, position: float, velocity: float, max_value: float) -> Tuple[float, float]:
        if position < 0:
            return 0.0, abs(velocity)
        if position > max_value:
            return max_value, -abs(velocity)
        return position, velocity


def create_contacts(count: int, seed: int | None = None) -> List[Contact]:
    rng = random.Random(seed)
    contacts = []
    for identifier in range(count):
        contacts.append(
            Contact(
                identifier=identifier,
                x=rng.random(),
                y=rng.random(),
                vx=rng.uniform(-0.05, 0.05),
                vy=rng.uniform(-0.05, 0.05),
                affinity=rng.uniform(0.4, 1.0),
            )
        )
    return contacts


def run_simulation(
    steps: int,
    dt: float,
    contacts: Sequence[Contact],
    bounds: Tuple[float, float] = (1.0, 1.0),
    damping: float = 0.98,
) -> List[Snapshot]:
    simulation = EvolutionSimulation(contacts=contacts, bounds=bounds, damping=damping)
    snapshots = []
    for _ in range(steps):
        snapshots.append(simulation.step(dt=dt))
    return snapshots


def generate_audio(
    snapshots: Iterable[Snapshot],
    output_path: str,
    sample_rate: int = 44100,
    step_duration: float = 0.1,
) -> None:
    """Generate a WAV file using simulation snapshots."""

    samples: List[int] = []
    for snapshot in snapshots:
        step_samples = int(sample_rate * step_duration)
        for sample_index in range(step_samples):
            t = sample_index / sample_rate
            value = 0.0
            for contact in snapshot.contacts:
                frequency = 220 + 220 * (contact.x + contact.y) / 2
                amplitude = min(1.0, contact.affinity)
                phase = 2 * math.pi * frequency * (snapshot.time + t)
                value += amplitude * math.sin(phase)
            value /= max(1, len(snapshot.contacts))
            value *= min(1.0, 0.4 + snapshot.energy)
            samples.append(int(max(-1.0, min(1.0, value)) * 32767))

    with wave.open(output_path, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(struct.pack("<" + "h" * len(samples), *samples))


def _color_for_contact(contact: Contact) -> Tuple[int, int, int]:
    intensity = int(80 + 175 * min(1.0, contact.affinity))
    return intensity, int(60 + 195 * contact.x), int(60 + 195 * contact.y)


def generate_visual_frames(
    snapshots: Iterable[Snapshot],
    output_dir: str,
    size: Tuple[int, int] = (512, 512),
) -> List[str]:
    """Generate PPM frames representing the simulation."""

    os.makedirs(output_dir, exist_ok=True)
    width, height = size
    frame_paths: List[str] = []
    for frame_index, snapshot in enumerate(snapshots):
        pixels = [[(12, 12, 24) for _ in range(width)] for _ in range(height)]
        for contact in snapshot.contacts:
            x = min(width - 1, max(0, int(contact.x * (width - 1))))
            y = min(height - 1, max(0, int(contact.y * (height - 1))))
            color = _color_for_contact(contact)
            pixels[y][x] = color
            for offset in (-1, 1):
                nx = min(width - 1, max(0, x + offset))
                ny = min(height - 1, max(0, y + offset))
                pixels[ny][nx] = color
        frame_path = os.path.join(output_dir, f"frame_{frame_index:04d}.ppm")
        with open(frame_path, "w", encoding="utf-8") as handle:
            handle.write(f"P3\n{width} {height}\n255\n")
            for row in pixels:
                handle.write(" ".join(f"{r} {g} {b}" for r, g, b in row))
                handle.write("\n")
        frame_paths.append(frame_path)
    return frame_paths


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Contact evolution generator")
    parser.add_argument("--steps", type=int, default=60)
    parser.add_argument("--dt", type=float, default=0.05)
    parser.add_argument("--contacts", type=int, default=8)
    parser.add_argument("--audio", default="contact_evolution.wav")
    parser.add_argument("--frames-dir", default="frames")
    parser.add_argument("--seed", type=int, default=42)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    contacts = create_contacts(args.contacts, seed=args.seed)
    snapshots = run_simulation(steps=args.steps, dt=args.dt, contacts=contacts)
    generate_audio(snapshots, args.audio)
    generate_visual_frames(snapshots, args.frames_dir)
    print(f"Generated {len(snapshots)} snapshots")
    print(f"Audio written to {args.audio}")
    print(f"Frames written to {args.frames_dir}")


if __name__ == "__main__":
    main()
