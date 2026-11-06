"""Exercise the actual backport upload step with local Git objects and a fake gh."""

import base64
import json
import os
from pathlib import Path
import subprocess
import tempfile
import textwrap
import unittest


WORKFLOW = Path(__file__).resolve().parents[1] / "workflows/backport.yml"


def upload_script():
    step = WORKFLOW.read_text().split(
        "      - name: Push backport branch as signed commit\n", 1
    )[1].split("\n      - name:", 1)[0]
    return textwrap.dedent(step.split("        run: |\n", 1)[1])


class BackportUploadTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.repo = self.root / "repo"
        self.repo.mkdir()
        self.calls = self.root / "calls.jsonl"
        self.bin = self.root / "bin"
        self.bin.mkdir()
        gh = self.bin / "gh"
        gh.write_text(
            "#!/usr/bin/env python3\n"
            "import json, os, pathlib, sys\n"
            "args = sys.argv[1:]\n"
            "call = {'args': args}\n"
            "if '--input' in args:\n"
            "    call['payload'] = json.loads(pathlib.Path(args[args.index('--input') + 1]).read_text())\n"
            "with open(os.environ['GH_TEST_CALLS'], 'a') as out:\n"
            "    out.write(json.dumps(call) + '\\n')\n"
            "if args == ['api', 'repos/example/repo/git/refs/heads/backport-test']:\n"
            "    sys.exit(0 if os.environ.get('GH_TEST_EXISTING') else 1)\n"
        )
        gh.chmod(0o755)
        self.env = dict(
            os.environ,
            PATH=f"{self.bin}{os.pathsep}{os.environ['PATH']}",
            GIT_CONFIG_GLOBAL=os.devnull,
            GIT_CONFIG_SYSTEM=os.devnull,
            GH_TOKEN="test-token",
            GH_TEST_CALLS=str(self.calls),
            REPO="example/repo",
            BASE_BRANCH="release-test",
            BACKPORT_BRANCH="backport-test",
            TMPDIR=str(self.root),
        )
        self.git("init", "-q")
        self.git("config", "user.name", "Backport Test")
        self.git("config", "user.email", "backport@example.invalid")
        self.git("config", "core.hooksPath", os.devnull)
        self.git("config", "commit.gpgsign", "false")
        self.git("commit", "--allow-empty", "-qm", "Initial")

    def git(self, *args):
        return subprocess.check_output(
            ["git", *args], cwd=self.repo, env=self.env, text=True
        ).strip()

    def write(self, path, data=b"committed contents\n"):
        file = self.repo / path
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_bytes(data)

    def commit(self):
        self.git("add", "-A")
        self.git("commit", "-qm", "Backport fixture")

    def base(self):
        self.git("update-ref", "refs/remotes/origin/release-test", "HEAD")

    def upload(self, succeeds=True):
        result = subprocess.run(
            ["bash", "-c", upload_script()],
            cwd=self.repo,
            env=self.env,
            text=True,
            capture_output=True,
        )
        calls = (
            [json.loads(line) for line in self.calls.read_text().splitlines()]
            if self.calls.exists()
            else []
        )
        if not succeeds:
            self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertEqual(calls, [], "Rejected changes must not touch remote refs")
            return result
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(calls[-1]["args"][0:2], ["api", "graphql"])
        return calls[-1]["payload"]["variables"]["input"]

    def test_reads_committed_blobs_with_binary_and_unusual_paths(self):
        self.base()
        expected = {
            "normal.txt": b"committed\n",
            "empty": b"",
            "binary": bytes(range(256)),
            "space tab\tnewline\nquote\".txt": b"unusual path",
            "-leading-dash": b"dash",
            "large": b"x" * 200_000,
        }
        for path, data in expected.items():
            self.write(path, data)
        self.commit()
        (self.repo / "normal.txt").unlink()
        payload = self.upload()
        actual = {
            entry["path"]: base64.b64decode(entry["contents"])
            for entry in payload["fileChanges"]["additions"]
        }
        self.assertEqual(actual, expected)
        self.assertEqual(payload["expectedHeadOid"], self.git("rev-parse", "HEAD^"))

    def test_modifications_renames_and_deletions(self):
        for path in ["modified", "renamed", "deleted"]:
            self.write(path)
        self.commit()
        self.base()
        self.write("modified", b"updated")
        self.git("mv", "renamed", "new name")
        self.git("rm", "deleted")
        self.commit()
        self.env["GH_TEST_EXISTING"] = "true"
        changes = self.upload()["fileChanges"]
        self.assertEqual({p["path"] for p in changes["additions"]}, {"modified", "new name"})
        self.assertEqual({p["path"] for p in changes["deletions"]}, {"renamed", "deleted"})

    def test_ignores_checkout_symlinks_and_symlinked_parent(self):
        self.base()
        self.write("directory/file", b"from Git")
        self.commit()
        (self.repo / "directory/file").unlink()
        (self.repo / "directory").rmdir()
        (self.repo / "directory").symlink_to("missing-directory")
        additions = self.upload()["fileChanges"]["additions"]
        self.assertEqual(base64.b64decode(additions[0]["contents"]), b"from Git")

    def test_rejects_added_symlink(self):
        self.base()
        (self.repo / "link").symlink_to("missing-file")
        self.commit()
        self.upload(succeeds=False)

    def test_rejects_modified_symlink(self):
        (self.repo / "link").symlink_to("first-missing-file")
        self.commit()
        self.base()
        (self.repo / "link").unlink()
        (self.repo / "link").symlink_to("second-missing-file")
        self.commit()
        self.upload(succeeds=False)

    def test_rejects_regular_file_to_symlink(self):
        self.write("file")
        self.commit()
        self.base()
        (self.repo / "file").unlink()
        (self.repo / "file").symlink_to("missing-file")
        self.commit()
        self.upload(succeeds=False)

    def test_rejects_symlink_to_regular_file(self):
        (self.repo / "file").symlink_to("missing-file")
        self.commit()
        self.base()
        (self.repo / "file").unlink()
        self.write("file")
        self.commit()
        self.upload(succeeds=False)

    def test_allows_deleting_symlink(self):
        (self.repo / "link").symlink_to("missing-file")
        self.commit()
        self.base()
        self.git("rm", "link")
        self.commit()
        self.assertEqual(self.upload()["fileChanges"]["deletions"], [{"path": "link"}])

    def test_rejects_submodule(self):
        self.base()
        self.git("update-index", "--add", "--cacheinfo", f"160000,{self.git('rev-parse', 'HEAD')},submodule")
        self.git("commit", "-qm", "Gitlink fixture")
        self.upload(succeeds=False)

    def test_diff_failure_prevents_remote_writes(self):
        self.env["BASE_BRANCH"] = "missing-branch"
        self.upload(succeeds=False)


if __name__ == "__main__":
    unittest.main()
