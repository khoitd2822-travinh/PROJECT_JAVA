#!/usr/bin/env python3
"""
Chạy toàn bộ kiểm thử tích hợp của Mục 13 (Nguyễn Thanh Liêm).

Script này là điểm khởi chạy duy nhất cho môi trường sạch — đáp ứng yêu cầu
"Kiểm tra hệ thống trên môi trường sạch" trong bảng phân công nhiệm vụ.

Các bước:
  1. Kiểm tra môi trường (Docker, Java, Maven, Python)
  2. Test backend (JUnit 5)
  3. Test MQTT giả lập (không cần board)
  4. Kiểm tra tài liệu bắt buộc của mục 13
  5. Sinh báo cáo kết quả

Cách dùng:
    python firmware/tests/run_integration_tests.py
    python firmware/tests/run_integration_tests.py --skip-maven
    python firmware/tests/run_integration_tests.py --report docs/testing/evidence/run-YYYY-MM-DD.md
"""

import argparse
import json
import os
import shutil
import socket
import subprocess
import sys
import time
from datetime import datetime

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BACKEND = os.path.join(ROOT, "BackEnd")
MOCK = os.path.join(ROOT, "firmware", "tests", "mock", "mock_mqtt_broker.py")

# Tài liệu bắt buộc theo mục 13 và tab "Một nùi cần fix"
REQUIRED_DOCS = [
    ("README.md", "Hướng dẫn chạy đầy đủ"),
    ("docs/api-spec.md", "API request/response và mã lỗi"),
    ("docs/mqtt-topics.md", "Danh sách MQTT topic, payload, QoS, retained"),
    ("docs/architecture/system-architecture.md", "Sơ đồ hệ thống"),
    ("docs/architecture/database-schema.md", "Sơ đồ database"),
    ("docs/hardware-schematic-bom.md", "Sơ đồ GPIO và danh sách cảm biến"),
    ("docs/testing/test-matrix.md", "Ma trận test"),
    ("docs/testing/demo-runbook.md", "Checklist và kịch bản demo"),
    (".env.example", "Cấu hình mẫu không chứa mật khẩu"),
]

GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
RESET = "\033[0m"


class Result:
    def __init__(self, name):
        self.name = name
        self.status = "SKIP"
        self.detail = ""
        self.duration = 0.0

    @property
    def icon(self):
        return {"PASS": f"{GREEN}PASS{RESET}", "FAIL": f"{RED}FAIL{RESET}",
                "SKIP": f"{YELLOW}SKIP{RESET}"}.get(self.status, self.status)


def run(cmd, cwd=None, timeout=600, capture=True):
    """Chạy lệnh, trả (returncode, output)."""
    try:
        proc = subprocess.run(
            cmd, cwd=cwd, timeout=timeout,
            stdout=subprocess.PIPE if capture else None,
            stderr=subprocess.STDOUT if capture else None,
            text=True, encoding="utf-8", errors="replace",
        )
        return proc.returncode, proc.stdout or ""
    except subprocess.TimeoutExpired:
        return 124, f"Timeout sau {timeout}s"
    except FileNotFoundError:
        return 127, f"Không tìm thấy lệnh: {cmd[0]}"


def check_environment():
    """Kiểm tra công cụ cần thiết có sẵn trên máy hay không."""
    results = []
    for tool, args in [("docker", ["--version"]), ("java", ["-version"]),
                       ("python", ["--version"])]:
        code, out = run([tool] + args, timeout=30)
        results.append((tool, code == 0, out.strip().splitlines()[0] if out.strip() else ""))

    mvnw = os.path.join(BACKEND, "mvnw.cmd")
    has_maven = os.path.exists(mvnw) or shutil.which("mvn") is not None
    results.append(("maven", has_maven, "mvnw" if os.path.exists(mvnw) else "mvn"))
    return results


def test_maven():
    """Chạy test backend bằng Maven."""
    mvnw = os.path.join(BACKEND, "mvnw.cmd")
    cmd = [mvnw, "test"] if os.path.exists(mvnw) else ["mvn", "test"]
    code, out = run(cmd, cwd=BACKEND, timeout=900)

    total = passed = failed = 0
    for line in out.splitlines():
        if "Tests run:" in line and "in " not in line:
            # Dòng tổng kết
            parts = line.split("Tests run:")[-1]
            nums = parts.split(",")
            try:
                total = int(nums[0].split()[0])
                failed += int(nums[1].split()[0])
                errors = int(nums[2].split()[0])
                failed += errors
                passed = total - failed
            except (IndexError, ValueError):
                pass

    result = Result("Test backend (JUnit 5)")
    result.duration = 0
    if code == 0:
        result.status = "PASS"
        result.detail = f"{total} test, 0 failure"
    else:
        result.status = "FAIL"
        result.detail = f"{passed}/{total} test pass, {failed} lỗi"
        errors = [ln for ln in out.splitlines() if "[ERROR]" in ln][:10]
        if errors:
            result.detail += " | " + " ; ".join(e.strip()[:160] for e in errors)
    return result


def test_mock_mqtt():
    """Kiểm tra script MQTT giả lập: broker độc lập + phát gói tin."""
    result = Result("MQTT giả lập (không cần board)")
    port = 11899

    # 1. Khởi động broker độc lập ở chế độ nền.
    #    Phải chạy nền vì broker lắng nghe vô hạn — nếu chạy foreground sẽ bị
    #    timeout của subprocess cắt ngang trước khi client kết nối được.
    broker_log = os.path.join(ROOT, "docs", "testing", "evidence", "mock-broker.log")
    os.makedirs(os.path.dirname(broker_log), exist_ok=True)
    broker = None
    try:
        log_file = open(broker_log, "w", encoding="utf-8")
        broker = subprocess.Popen(
            [sys.executable, MOCK, "--standalone", "--port", str(port)],
            stdout=log_file, stderr=subprocess.STDOUT,
            env={**os.environ, "PYTHONIOENCODING": "utf-8"},
        )
        # Chờ broker lắng nghe
        for _ in range(40):
            time.sleep(0.25)
            if broker.poll() is not None:
                break
            try:
                probe = socket.create_connection(("127.0.0.1", port), timeout=0.5)
                probe.close()
                break
            except OSError:
                continue
        else:
            result.status = "FAIL"
            result.detail = "broker không lắng nghe được trong 10 giây"
            return result

        if broker.poll() is not None:
            result.status = "FAIL"
            result.detail = "broker thoát ngay, xem " + broker_log
            return result

        # 2. Phát telemetry tới broker đó
        code, out = run([sys.executable, MOCK, "--port", str(port),
                         "--publish", "telemetry", "--count", "3", "--interval", "0.3"], timeout=30)
        if code != 0:
            result.status = "FAIL"
            result.detail = out.strip()[:200]
            return result

        # 3. Chạy kịch bản lỗi
        for scenario in ("invalid", "missing_id", "missing_measurement", "multi_zone"):
            code, out = run([sys.executable, MOCK, "--port", str(port),
                             "--scenario", scenario], timeout=30)
            if code != 0:
                result.status = "FAIL"
                result.detail = f"kịch bản '{scenario}' lỗi: {out.strip()[:160]}"
                return result

        result.status = "PASS"
        result.detail = ("broker độc lập + publish telemetry + 4 kịch bản lỗi "
                         "(invalid / missing_id / missing_measurement / multi_zone)")
        return result
    finally:
        if broker is not None and broker.poll() is None:
            broker.terminate()
            try:
                broker.wait(timeout=5)
            except subprocess.TimeoutExpired:
                broker.kill()
        try:
            log_file.close()
        except Exception:  # noqa: BLE001
            pass


def test_docs():
    """Kiểm tra các tài liệu bắt buộc của mục 13 có tồn tại và không rỗng."""
    result = Result("Tài liệu mục 13")
    missing = []
    empty = []
    for rel, desc in REQUIRED_DOCS:
        path = os.path.join(ROOT, rel.replace("/", os.sep))
        if not os.path.exists(path):
            missing.append(rel)
        elif os.path.getsize(path) == 0:
            empty.append(rel)

    if missing or empty:
        result.status = "FAIL"
        if missing:
            result.detail += "thiếu: " + ", ".join(missing)
        if empty:
            result.detail += " | rỗng: " + ", ".join(empty)
    else:
        result.status = "PASS"
        result.detail = f"{len(REQUIRED_DOCS)}/{len(REQUIRED_DOCS)} tài liệu có nội dung"
    return result


def test_secrets():
    """Rà file tự sinh và thông tin nhạy cảm trước khi tích hợp."""
    result = Result("Rà thông tin nhạy cảm")

    # .env.example không được chứa giá trị bí mật thật
    env_example = os.path.join(ROOT, ".env.example")
    problems = []
    if os.path.exists(env_example):
        with open(env_example, "r", encoding="utf-8", errors="replace") as fh:
            content = fh.read()
        for line in content.splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            value = value.strip()
            if any(s in key.upper() for s in ("PASSWORD", "SECRET", "TOKEN", "ACCESS_KEY")):
                if value and "CHANGE_ME" not in value and "example" not in value.lower():
                    problems.append(f"{key} chứa giá trị thật")

    # File sinh tự động không nên nằm trong git
    junk_patterns = ("extracted_plan", "build_log", "thu.txt", "plan_output", "mock-broker.log")
    tracked = run(["git", "ls-files"], cwd=ROOT, timeout=60)[1].splitlines()
    junk_tracked = [j for j in tracked if any(p in j for p in junk_patterns)]

    if problems:
        result.status = "FAIL"
        result.detail = "; ".join(problems)
    elif junk_tracked:
        result.status = "FAIL"
        result.detail = "file tự sinh đang được commit: " + ", ".join(junk_tracked)
    else:
        result.status = "PASS"
        result.detail = ".env.example sạch, không có file tự sinh trong git"
    return result


def write_report(results, path):
    """Ghi báo cáo kết quả ra file markdown."""
    lines = [
        "# Báo cáo chạy kiểm thử tích hợp",
        "",
        f"**Thời điểm:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        "**Người chạy:** Nguyễn Thanh Liêm (mục 13)",
        "**Lệnh:** `python firmware/tests/run_integration_tests.py`",
        "",
        "## Kết quả",
        "",
        "| Bước | Kết quả | Chi tiết |",
        "| :--- | :--- | :--- |",
    ]
    for r in results:
        status = {"PASS": "✅ PASS", "FAIL": "❌ FAIL", "SKIP": "⏭️ SKIP"}.get(r.status, r.status)
        detail = r.detail.replace("|", "\\|")
        lines.append(f"| {r.name} | {status} | {detail} |")

    failed = [r for r in results if r.status == "FAIL"]
    lines += [
        "",
        "## Kết luận",
        "",
        f"- Tổng: {len(results)} bước",
        f"- Pass: {len([r for r in results if r.status == 'PASS'])}",
        f"- Fail: {len(failed)}",
        f"- Skip: {len([r for r in results if r.status == 'SKIP'])}",
        "",
    ]
    if failed:
        lines.append("### Các bước cần xử lý")
        lines.append("")
        for r in failed:
            lines.append(f"- **{r.name}** — {r.detail}")
        lines.append("")

    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))


def main():
    parser = argparse.ArgumentParser(description="Chạy kiểm thử tích hợp mục 13")
    parser.add_argument("--skip-maven", action="store_true", help="Bỏ qua test backend")
    parser.add_argument("--skip-mock", action="store_true", help="Bỏ qua test MQTT giả lập")
    parser.add_argument("--report", default="", help="Đường dẫn file báo cáo markdown")
    args = parser.parse_args()

    print("=" * 68)
    print("  KIỂM THỬ TÍCH HỢP — MỤC 13")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 68)

    print("\n[1/4] Kiểm tra môi trường")
    for tool, ok, detail in check_environment():
        mark = "OK " if ok else "THIEU"
        print(f"  [{mark}] {tool:8s} {detail}")

    results = []

    print("\n[2/4] Test backend")
    if args.skip_maven:
        r = Result("Test backend (JUnit 5)")
        r.status = "SKIP"
        r.detail = "bị bỏ qua bởi --skip-maven"
    else:
        r = test_maven()
    print(f"  [{r.status}] {r.name} — {r.detail}")
    results.append(r)

    print("\n[3/4] Test MQTT giả lập")
    if args.skip_mock:
        r = Result("MQTT giả lập (không cần board)")
        r.status = "SKIP"
        r.detail = "bị bỏ qua bởi --skip-mock"
    else:
        r = test_mock_mqtt()
    print(f"  [{r.status}] {r.name} — {r.detail}")
    results.append(r)

    print("\n[4/4] Kiểm tra tài liệu và thông tin nhạy cảm")
    for r in (test_docs(), test_secrets()):
        print(f"  [{r.status}] {r.name} — {r.detail}")
        results.append(r)

    print("\n" + "=" * 68)
    failed = [r for r in results if r.status == "FAIL"]
    print(f"  KẾT QUẢ: {len(results) - len(failed)}/{len(results)} bước đạt")
    if failed:
        print("  Cần xử lý:")
        for r in failed:
            print(f"    - {r.name}: {r.detail}")
    print("=" * 68)

    report_path = args.report
    if not report_path:
        report_path = os.path.join(ROOT, "docs", "testing", "evidence",
                                    f"run-{datetime.now().strftime('%Y-%m-%d-%H%M')}.md")
    os.makedirs(os.path.dirname(report_path), exist_ok=True)
    write_report(results, report_path)
    print(f"\n  Báo cáo: {report_path}\n")

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
