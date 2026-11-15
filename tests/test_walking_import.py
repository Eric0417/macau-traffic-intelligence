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


class FacilityTagPolicy(unittest.TestCase):
    def test_category_uses_tags_instead_of_name(self):
        self.assertEqual(walking.facility_category({"amenity": "hospital"}), "hospital")
        self.assertEqual(walking.facility_category({"healthcare": "doctors"}), "clinic")
        self.assertEqual(walking.facility_category({"amenity": "pharmacy"}), "pharmacy")
        self.assertIsNone(walking.facility_category({"name": "醫院後街"}))
        self.assertIsNone(walking.facility_category({"amenity": "parking", "name": "鏡湖醫院停車場"}))

    def test_excludes_explicitly_unavailable_facilities(self):
        for tags in [
            {"amenity": "toilets", "access": "customers"},
            {"amenity": "hospital", "disused": "yes"},
            {"amenity": "toilets", "name": "公廁 (暫停開放)"},
        ]:
            with self.subTest(tags=tags):
                self.assertIsNone(walking.facility_category(tags))


if __name__ == "__main__":
    unittest.main()
