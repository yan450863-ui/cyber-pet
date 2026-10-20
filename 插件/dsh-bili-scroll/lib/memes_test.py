"""离线测试图库图片发送桥接，不连接B站、不读取真实凭证。"""
import asyncio
import importlib.util
import os
from contextlib import contextmanager

@contextmanager
def fixture():
    yield os.environ["MEME_TEST_HOME"]
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch
from PIL import Image

spec = importlib.util.spec_from_file_location("bili_meme_test_server", Path(__file__).parents[1] / "vendor/bilibili-mcp/mcp_server.py")
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)

class MemeSendTests(unittest.IsolatedAsyncioTestCase):
    async def test_owner_mention_has_real_uid_mapping_and_single_send(self):
        import json
        class FakeApi:
            sent = []
            def __init__(self, **kwargs): pass
            def update_data(self, **data):
                self.sent.append(data)
                return self
            @property
            async def result(self): return {"rpid": 456}
        info = AsyncMock(return_value={"aid":123})
        fake_video = type("Video", (), {"get_info":info})()
        with patch.object(server,"get_cred",return_value=object()), patch.object(server.video,"Video",return_value=fake_video), patch.object(server.comment,"Api",FakeApi):
            result=json.loads(await server.bili_reply("BV1111111111","@主人账号 这个动画好看。",mention_uid="12345",mention_name="主人账号"))
        self.assertTrue(result["success"])
        self.assertEqual(len(FakeApi.sent),1)
        self.assertEqual(json.loads(FakeApi.sent[0]["at_name_to_mid"]),{"主人账号":12345})

    async def test_image_and_text_single_send(self):
        with fixture() as folder:
            home = Path(folder)
            images = home / "memes/gpt6/开心"
            file = images / "smile.png"
            info = AsyncMock(return_value={"aid": 123})
            send = AsyncMock(return_value={"rpid": 999})
            fake_video = type("Video", (), {"get_info": info})()
            with patch.object(server, "__file__", str(home / "mcp_server.py")), patch.object(server, "get_cred", return_value=object()), patch.object(server.video, "Video", return_value=fake_video), patch.object(server.comment, "send_comment", send):
                await server.bili_reply("BV1111111111", "好呀", 42, 40, ["memes/gpt6/开心/smile.png"])
            send.assert_awaited_once()
            args = send.call_args.kwargs
            self.assertEqual(args["text"], "好呀")
            self.assertEqual(args["root"], 40)
            self.assertEqual(args["parent"], 42)
            self.assertEqual(len(args["pic"]), 1)
            self.assertTrue(args["pic"][0].content.startswith(b"\x89PNG"))

    async def test_reject_escape_before_credentials_or_network(self):
        with fixture() as folder:
            with patch.object(server, "__file__", str(Path(folder) / "mcp_server.py")), patch.object(server, "get_cred", side_effect=AssertionError("不能访问凭证")):
                for name in ["../secret.png", str(Path(folder) / "secret.png"), "https://example.com/a.png"]:
                    with self.assertRaises(ValueError):
                        await server.bili_reply("BV1111111111", "好呀", images=[name])

if __name__ == "__main__":
    unittest.main()
