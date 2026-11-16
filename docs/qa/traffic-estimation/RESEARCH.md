# Estimating traffic on unmonitored streets

16 November 2026. Offline experiment only; no live inference layer is enabled.

## Research and available inputs

Offor, Vaci and Mihaylova combine Kriging with a particle filter and a traffic-flow model. Their method needs measurements over time and model boundary conditions. This is more than assigning a side street its nearest road's colour. [Sensors 2019, 19(12), 2813](https://www.mdpi.com/1424-8220/19/12/2813).

Nie, Qin, Wang and Sun use a low-rank tensor with graph regularisation for spatial proximity, temporal continuity and periodicity. This suggests collecting a segment-by-time history before fitting correlations. Their reported performance on other datasets is not evidence of accuracy in Macau. [Transportation Research Part C, 2023](https://arxiv.org/abs/2210.11780).

Wu et al. estimate traffic states from sparse trajectories with an anisotropic Gaussian process and quantify uncertainty. Their congestion-propagation model and trajectory inputs do not directly match our categorical road-status snapshot. [Paper, revised April 2024](https://arxiv.org/abs/2303.02311).

The existing adapter exposes official normal/slow/congested/unknown categories and geometry. The captured normalized response has 1,268 segments: 932 normal, 143 slow, 23 congested and 170 unknown. It was retrieved at 10:07:53 Macau time, with source update 10:01:02 and `stale: true`. It is a frozen retrospective test sample, not a current traffic claim. No source endpoint or TTL changed.

The checked-in walking network is not a verified motor-vehicle graph. Pedestrian paths, one-way restrictions, turns, elevated roads, signals and queue spillback prevent treating geographic proximity as driving connectivity. Bus positions are official estimates and contain stop dwell; their reported speed is not an unbiased car-speed measurement.

## Reproducible baseline

Run from the repository root:

```sh
python3 scripts/test-road-inference.py
python3 scripts/evaluate-road-inference.py docs/qa/traffic-estimation/roads-snapshot.json docs/qa/traffic-estimation/evaluation.json
```

The baseline joins segment endpoints within 15 m, excludes reversed duplicate geometry and searches up to 300 m along that approximate graph. At least two distinct observed segments must contribute. Distance-weighted categorical votes must have 80% agreement; this agreement threshold is not calibrated confidence. It withholds an answer otherwise. These fixed exploratory parameters were not fitted on the held-out labels.

Five deterministic folds hide either segment IDs or entire street names. Each known label is held out once. The majority baseline is fitted on the visible portion of each fold and evaluated on exactly the same covered cases. Labels are publisher statuses, not observed travel-time ground truth.

| Masking | Cases with an answer | Accuracy on covered cases | Majority baseline | Congested cases detected |
| --- | --- | --- | --- | --- |
| Individual segments | 782/1,098 (71.2%) | 99.5% | 90.2% | 2/2 covered, 2/23 total |
| Whole street names | 283/1,098 (25.8%) | 80.6% | 88.3% | 0/9 covered, 0/23 total |

The segment result is inflated by nearby portions of the same observed street retaining their labels. Whole-street masking is closer to the requested missing-street situation. It performs worse than the majority baseline on its covered subset and misses every covered congested segment. Even whole-street masking does not prove performance on genuinely unmonitored streets. A single timestamp also cannot measure temporal generalisation.

## Decision and next validation

Keep unknown roads unknown in this release. Publishing the baseline would imply coverage the experiment does not support. The app's legend explains that grey means no confirmed status, not free flow.

A usable next model needs a verified directed driving graph, a multi-day timestamped series with source freshness, and held-out streets and days. Compare graph interpolation with a historical same-time baseline; report coverage, per-class recall, congestion missed as clear, and calibration. New collection/retention and any live inference contract require a separate ADR and source-document update before implementation. Estimates must be visually distinct, labelled, and withdrawn when evidence is stale or insufficient.
