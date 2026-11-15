import importlib.util
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest

# Policy tests need no PBF reader or external data.
sys.modules["osmium"] = SimpleNamespace(SimpleHandler=object)
spec = importlib.util.spec_from_file_location("walking", Path(__file__).parents[1] / "scripts/build-walking-network.py")
walking = importlib.util.module_from_spec(spec)
spec.loader.exec_module(walking)


class WalkingGatePolicy(unittest.TestCase):
    def test_unlocked_public_gate(self):
        self.assertFalse(walking.node_blocks_walking({"barrier": "gate", "locked": "no"}))
        self.assertFalse(walking.node_blocks_walking({"barrier": "gate", "foot": "yes"}))

    def test_restrictions_still_block(self):
        for tags in [
            {"barrier": "gate"},
            {"barrier": "gate", "locked": "yes", "foot": "yes"},
            {"barrier": "gate", "locked": "no", "access": "private"},
            {"barrier": "gate", "locked": "no", "foot": "no"},
            {"barrier": "gate", "locked": "no", "access:conditional": "yes @ (09:00-18:00)"},
            {"barrier": "wall", "locked": "no"},
        ]:
            with self.subTest(tags=tags):
                self.assertTrue(walking.node_blocks_walking(tags))


if __name__ == "__main__":
    unittest.main()
