"""Solve shipped data again, independently of the saved audit report."""
import importlib.util
import json
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('trial_design',ROOT/'tools/trial-levels.py')
audit=importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)

def level(n):
    return json.loads((ROOT/'flower-trial'/f'level-{n}.json').read_text())

class TrialDesignTest(unittest.TestCase):
    def test_preset_cues_are_incomplete_and_have_clear_completions(self):
        for n in (22,23,25):
            with self.subTest(level=n):
                data=level(n);preset={tuple(p['cell']) for p in data['given']['presetPots']}
                self.assertEqual(len(preset),3)
                self.assertTrue(any(preset<set(map(tuple,t['solutionCells'])) for t in data['targets']))
                norm=tuple(sorted(((x-min(a for a,b in preset),y-min(b for a,b in preset)) for x,y in preset),key=lambda c:(c[1],c[0])))
                for t in data['targets']:
                    self.assertNotIn(norm,dict(audit.variants(t['shape'])))
                completions=audit.preset_completions(data)
                self.assertEqual(len(completions),1)
                self.assertEqual({c['assetId'] for c in completions},{'T4' if n==25 else 'L4'})
                if n==25:self.assertTrue(all(0<=x<=2 and 2<=y<=4 for x,y in preset),'cue must stay inside the reported left red box')
                self.assertGreater(audit.analyze(data)['solutions'],1)
        for n in range(1,21):self.assertFalse(level(n)['given']['presetPots'])
        self.assertTrue(level(21)['given']['presetPots'])

    def test_board_outline_exposes_shape_examples_without_early_presets(self):
        for n in (13,):
            data=level(n);pieces=[set(map(tuple,t['solutionCells'])) for t in data['targets']]
            active=set.union(*pieces);fences=[{tuple(f['a']),tuple(f['b'])} for f in data['fences']]
            hinted=set()
            for t,piece in zip(data['targets'],pieces):
                contacts=sum(q in active-piece and {p,q} not in fences for p in piece for q in audit.neighbors(p))
                if contacts<=2:hinted.add(t['assetId'])
            self.assertEqual(hinted,{'L3','L4'} if n==13 else {'L3','T4'})
            self.assertFalse(data['given']['presetPots'])
            self.assertEqual(len(data['targets']),6 if n==13 else 8)

    def test_level_19_has_less_work_and_fewer_misleading_openings(self):
        data=level(19);metrics=audit.analyze(data)
        self.assertEqual(len(data['targets']),6)
        self.assertEqual({t['assetId'] for t in data['targets']},{'L3','T4'})
        self.assertLessEqual(metrics['playableCells'],22)
        self.assertLessEqual(metrics['placements'],65)
        self.assertLessEqual(metrics['deadPct'],45)
        self.assertGreaterEqual(metrics['solutions'],3)
        self.assertGreaterEqual(len(data['fences']),2)
        self.assertFalse(data['given']['presetPots'])

    def test_straight_practice_requires_both_directions_in_every_solution(self):
        for n in (4,8,12):
            with self.subTest(level=n):
                data=level(n)
                self.assertGreater(audit.analyze(data)['solutions'],0)
                self.assertEqual(audit.analyze(data,'horizontal')['solutions'],0)
                self.assertEqual(audit.analyze(data,'vertical')['solutions'],0)
                horizontal=sum(len({y for x,y in t['solutionCells']})==1 for t in data['targets'])
                self.assertGreaterEqual(horizontal,2)
                self.assertGreaterEqual(len(data['targets'])-horizontal,2)

    def test_straight_layouts_interlock_instead_of_forming_separate_strips(self):
        for n in (4,8,12):
            with self.subTest(level=n):
                data=level(n)
                pieces=[set(map(tuple,t['solutionCells'])) for t in data['targets']]
                active=set.union(*pieces)
                horizontal=[len({y for x,y in p})==1 for p in pieces]
                # No whole-board grid line can split the authored flowers into
                # independent regions, as the former cap-and-stem boards did.
                for axis in (0,1):
                    for cut in range(min(p[axis] for p in active),max(p[axis] for p in active)):
                        self.assertTrue(any(min(p[axis] for p in s)<=cut<max(p[axis] for p in s) for s in pieces))
                for i,piece in enumerate(pieces):
                    self.assertTrue(any(horizontal[i]!=horizontal[j] and
                                        any(q in other for p in piece for q in audit.neighbors(p))
                                        for j,other in enumerate(pieces)))
                self.assertGreaterEqual(audit.straight_interleaving(data)['directionChoiceCells'],4)
                self.assertEqual(len(pieces),4 if n==4 else 5)

    def test_each_retained_fence_blocks_an_otherwise_complete_solution(self):
        for n in range(1,26):
            data=level(n)
            if not data['fences']:continue
            base=audit.analyze(data)['solutions']
            self.assertGreater(base,0)
            for j in range(len(data['fences'])):
                with self.subTest(level=n,fence=j+1):
                    without_one=dict(data,fences=data['fences'][:j]+data['fences'][j+1:])
                    self.assertGreater(audit.analyze(without_one)['solutions'],base)

    def test_bent_shapes_replace_repetitive_straight_and_square_practice(self):
        for n in (9,10,13,15,17,18,20,21,22,23,24):
            self.assertTrue({t['assetId'] for t in level(n)['targets']}<={'L3','L4'},n)
        for n in range(1,26):
            types={t['assetId'] for t in level(n)['targets']}
            self.assertLessEqual(len(types),2)
            if 'I4' in types:self.assertIn(n,(4,8,12))
            if 'square4' in types:self.assertIn(n,(1,7))
        self.assertEqual(level(10)['width'],3)
        self.assertEqual(level(10)['height'],4)
        self.assertEqual(audit.analyze(level(10))['solutions'],4)

if __name__=='__main__':unittest.main()
