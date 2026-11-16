import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location('inference', pathlib.Path(__file__).with_name('evaluate-road-inference.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class InferenceTests(unittest.TestCase):
    def test_needs_two_independent_observations(self):
        self.assertIsNone(module.estimate(0, {1: 'normal'}, [[(1, 50)], [], []]))
        self.assertEqual(module.estimate(0, {1: 'slow', 2: 'slow'}, [[(1, 50), (2, 60)], [], []]), 'slow')

    def test_conflicting_or_distant_evidence_is_withheld(self):
        self.assertIsNone(module.estimate(0, {1: 'normal', 2: 'congested'}, [[(1, 50), (2, 50)], [], []]))
        self.assertIsNone(module.estimate(0, {1: 'slow', 2: 'slow'}, [[(1, 301), (2, 301)], [], []]))

    def test_duplicate_paths_do_not_count_a_sensor_twice(self):
        self.assertIsNone(module.estimate(0, {3: 'slow'}, [[(1, 10), (2, 10)], [(3, 10)], [(3, 10)], []]))

    def test_opposite_carriageway_is_not_a_neighbor(self):
        def road(coords):
            return {'properties': {'lengthMeters': 100}, 'geometry': {'coordinates': coords}}
        links = module.graph([road([[113.55, 22.18], [113.55, 22.181]]), road([[113.55, 22.181], [113.55, 22.18]])])
        self.assertEqual(links, [[], []])


if __name__ == '__main__':
    unittest.main()
