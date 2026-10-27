"""Native file bridge integration; independent of Cocoa or pywebview installation."""
import sys,tempfile,unittest,json,base64
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src'))
from level_editor_shell.file_api import FileApi
class FileApiTest(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.api=FileApi(self.root)
 def tearDown(self):self.tmp.cleanup()
 def test_discovery_write_refresh_and_no_clobber(self):
  self.assertTrue(self.api.mkdir('level/asset',True)['ok'])
  level={'code':'stage-0001','sequence':1}
  self.assertTrue(self.api.write_text('level/level-1.json',json.dumps(level),False)['ok'])
  self.assertEqual(self.api.write_text('level/level-1.json','bad',False)['error']['code'],'ALREADY_EXISTS')
  self.assertEqual(json.loads(self.api.read_text('level/level-1.json')['data']['content']),level)
  self.assertEqual(self.api.list_dir('level')['data']['entries'][1]['name'],'level-1.json')
 def test_three_collections_round_trip(self):
  for folder in ['level','shape-fill','flower-trial']:
   self.assertTrue(self.api.mkdir(folder)['ok'])
   value={'id':{'level':1,'shape-fill':100001,'flower-trial':200001}[folder],'name':'花田测试','timeLimit':120}
   target=f'{folder}/level-1.json'
   self.assertTrue(self.api.write_text(target,json.dumps(value,ensure_ascii=False))['ok'])
   value['timeLimit']=180
   self.assertTrue(self.api.write_text(target,json.dumps(value,ensure_ascii=False))['ok'])
   self.assertEqual(json.loads(self.api.read_text(target)['data']['content']),value)
   self.assertEqual(self.api.list_dir(folder)['data']['entries'][0]['name'],'level-1.json')
 def test_image_bytes_and_confirmed_delete(self):
  self.api.mkdir('level/asset',True)
  self.assertTrue(self.api.write_base64('level/asset/a.png',base64.b64encode(b'png test').decode())['ok'])
  self.assertEqual((self.root/'level/asset/a.png').read_bytes(),b'png test')
  self.assertTrue(self.api.delete('level/asset/a.png',False)['ok'])
 def test_cannot_escape_root(self):
  self.assertEqual(self.api.read_text('../secret')['error']['code'],'PATH_OUTSIDE_ROOT')
  self.assertEqual(self.api.write_text('/tmp/outside','no')['error']['code'],'PATH_OUTSIDE_ROOT')
 def test_failures_are_reported(self):
  self.assertEqual(self.api.read_text('missing')['error']['code'],'NOT_FOUND')
  self.assertEqual(self.api.write_base64('bad','@@@@')['error']['code'],'INVALID_BASE64')
if __name__=='__main__':unittest.main()
