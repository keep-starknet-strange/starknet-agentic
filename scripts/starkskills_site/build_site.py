#!/usr/bin/env python3
"""Build the Starkskills static site from repository data."""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import shutil
from collections.abc import Iterable
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote

DEFAULT_REPO_SLUG = "keep-starknet-strange/starknet-agentic"
DEFAULT_REPO_REF = "main"
DEFAULT_OUTPUT_DIR = "starkskills-site"
DEFAULT_PLUGIN_PATH = Path(".claude-plugin/plugin.json")
DEFAULT_SKILLS_MANIFEST_PATH = Path("skills/manifest.json")
ROUTER_PATH_CANDIDATES = (Path("SKILL.md"), Path("skills/SKILL.md"))
QUALITY_WORKFLOW_CANDIDATES = ("ci.yml", "quality.yml")
FULL_EVALS_WORKFLOW_CANDIDATES = ("cairo-skills-full-evals.yml", "full-evals.yml")
LEGACY_REPO_SLUG = "keep-starknet-strange/starknet-skills"
DOMAIN_PATTERN = re.compile(r"(?=.{1,253}\Z)(?!-)(?:[A-Za-z0-9-]{1,63}\.)+[A-Za-z0-9-]{2,63}(?<!-)")
REPO_SLUG_PATTERN = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")

ASCII_LOGO = r"""
███████╗████████╗ █████╗ ██████╗ ██╗  ██╗███████╗██╗  ██╗██╗██╗     ██╗     ███████╗
██╔════╝╚══██╔══╝██╔══██╗██╔══██╗██║ ██╔╝██╔════╝██║ ██╔╝██║██║     ██║     ██╔════╝
███████╗   ██║   ███████║██████╔╝█████╔╝ ███████╗█████╔╝ ██║██║     ██║     ███████╗
╚════██║   ██║   ██╔══██║██╔══██╗██╔═██╗ ╚════██║██╔═██╗ ██║██║     ██║     ╚════██║
███████║   ██║   ██║  ██║██║  ██║██║  ██╗███████║██║  ██╗██║███████╗███████╗███████║
╚══════╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝╚══════╝╚══════╝╚══════╝
""".strip("\n")


@dataclass
class ScorecardMetrics:
    path: Path
    cases: int | None
    precision: float | None
    recall: float | None


@dataclass
class VulnCard:
    name: str
    path: Path
    trigger: str
    detection_rule: str
    source_findings: list[str]
    severity_distribution: dict[str, int]


def read_jsonl(path: Path) -> list[dict]:
    rows: list[dict] = []
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        stripped = raw_line.strip()
        if not stripped:
            continue
        rows.append(json.loads(stripped))
    return rows


def count_md_files(directory: Path) -> int:
    return sum(1 for p in directory.glob("*.md") if p.name != "README.md")


def parse_version(path: Path) -> tuple[int, int, int]:
    match = re.match(r"^v(\d+)\.(\d+)\.(\d+)", path.name)
    if not match:
        return (0, 0, 0)
    return (int(match.group(1)), int(match.group(2)), int(match.group(3)))


def parse_scorecard(path: Path) -> ScorecardMetrics:
    text = path.read_text(encoding="utf-8")
    cases = _find_int(r"- Cases:\s+(\d+)", text)
    precision = _find_float(r"- Precision:\s+([0-9.]+)", text)
    recall = _find_float(r"- Recall:\s+([0-9.]+)", text)
    return ScorecardMetrics(path=path, cases=cases, precision=precision, recall=recall)


def _find_int(pattern: str, text: str) -> int | None:
    match = re.search(pattern, text)
    return int(match.group(1)) if match else None


def _find_float(pattern: str, text: str) -> float | None:
    match = re.search(pattern, text)
    return float(match.group(1)) if match else None


def pick_latest_scorecards(
    scorecard_dir: Path,
) -> tuple[ScorecardMetrics | None, ScorecardMetrics | None, ScorecardMetrics | None]:
    files = [p for p in scorecard_dir.glob("v*.md") if p.is_file()]
    if not files:
        return None, None, None

    real_world = [p for p in files if "cairo-auditor-realworld-benchmark" in p.name]
    deterministic = [p for p in files if "cairo-auditor-benchmark" in p.name and "realworld" not in p.name]
    contract_skill = [p for p in files if "contract-skill-benchmark" in p.name]

    def _pick(candidates: list[Path]) -> ScorecardMetrics | None:
        if not candidates:
            return None
        chosen = max(candidates, key=lambda item: (parse_version(item), item.name))
        return parse_scorecard(chosen)

    return _pick(deterministic), _pick(contract_skill), _pick(real_world)


def parse_card_sections(markdown_text: str) -> dict[str, str]:
    sections: dict[str, str] = {}
    current: str | None = None
    buf: list[str] = []

    for line in markdown_text.splitlines():
        if line.startswith("## "):
            if current is not None:
                sections[current] = "\n".join(buf).strip()
            current = line[3:].strip()
            buf = []
            continue
        if current is not None:
            buf.append(line)

    if current is not None:
        sections[current] = "\n".join(buf).strip()

    return sections


def compact_markdown_text(value: str, limit: int = 220) -> str:
    if not value:
        return ""
    text = value
    text = re.sub(r"```[\s\S]*?```", " ", text)
    text = re.sub(r"`([^`]+)`", r"\1", text)
    text = re.sub(r"\[(.*?)\]\(.*?\)", r"\1", text)
    text = re.sub(r"^[-*]\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def parse_source_findings(section: str) -> list[str]:
    ids: list[str] = []
    for line in section.splitlines():
        match = re.search(r"`([^`]+)`", line)
        if match:
            ids.append(match.group(1).strip())
    return ids


def github_blob(path: Path, root: Path, repo_github: str, repo_ref: str) -> str:
    rel = path.relative_to(root).as_posix()
    return f"{repo_github}/blob/{repo_ref}/{rel}"


def raw_path_url(path: str, repo_raw: str) -> str:
    return f"{repo_raw}/{path}"


def normalize_domain(value: str | None) -> str | None:
    if value is None:
        return None
    domain = value.strip().lower()
    if not domain:
        raise ValueError("Domain must not be empty.")
    if any(ch.isspace() for ch in domain):
        raise ValueError(f"Domain contains whitespace: {value!r}")
    if not DOMAIN_PATTERN.fullmatch(domain):
        raise ValueError(f"Invalid domain: {value!r}")
    return domain


def normalize_repo_slug(value: str) -> str:
    slug = value.strip()
    if not REPO_SLUG_PATTERN.fullmatch(slug):
        raise ValueError(f"Invalid repo slug: {value!r}. Expected OWNER/REPO.")
    return slug


def normalize_repo_ref(value: str) -> str:
    ref = value.strip()
    if not ref or any(ch.isspace() for ch in ref):
        raise ValueError(f"Invalid repo ref: {value!r}")
    return ref


def require_file(path: Path) -> Path:
    if not path.is_file():
        raise SystemExit(f"[build_site] Required file not found: {path}")
    return path


def require_directory(path: Path) -> Path:
    if not path.is_dir():
        raise SystemExit(f"[build_site] Required directory not found: {path}")
    return path


def load_json_object(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as exc:
        raise SystemExit(f"[build_site] Invalid JSON at {path}: {exc}") from exc
    if not isinstance(parsed, dict):
        raise SystemExit(f"[build_site] Expected JSON object at {path}")
    return parsed


def required_nonempty_string_field(data: dict, key: str, source_path: Path) -> str:
    value = data.get(key)
    if not isinstance(value, str) or not value.strip():
        raise SystemExit(f"[build_site] Missing {key} in {source_path}")
    return value


def required_nonempty_list_field(data: dict, key: str, source_path: Path) -> list[object]:
    value = data.get(key)
    if not isinstance(value, list) or not value:
        raise SystemExit(f"[build_site] Missing {key} list in {source_path}")
    return value


def optional_nonempty_string_field(data: dict, key: str, default: str) -> str:
    value = data.get(key)
    if isinstance(value, str) and value.strip():
        return value
    return default


def build_manifest_index(manifest_skills: list[object]) -> dict[str, dict]:
    manifest_by_repo_path: dict[str, dict] = {}
    for item in manifest_skills:
        if not isinstance(item, dict):
            continue
        repo_path = item.get("repo_path")
        if isinstance(repo_path, str) and repo_path:
            manifest_by_repo_path[repo_path] = item
    return manifest_by_repo_path


def normalize_skill_repo_path(entry: str) -> str:
    path = entry.strip()
    if path.startswith("./"):
        path = path[2:]
    path = path.rstrip("/")
    if not path.startswith("skills/"):
        raise SystemExit(f"[build_site] Unsupported skill entry (must start with skills/): {entry!r}")
    return path


def skill_sigil(skill_name: str) -> str:
    parts = [part for part in skill_name.split("-") if part]
    if not parts:
        return "SKL"
    letters = "".join(part[0] for part in parts).upper()
    letters = letters[:3]
    if len(letters) < 3:
        letters = (letters + "".join(ch for ch in skill_name.upper() if ch.isalpha()))[:3]
    return letters or "SKL"


def resolve_router_skill_path(root: Path) -> str:
    for candidate in ROUTER_PATH_CANDIDATES:
        path = root / candidate
        if path.is_file():
            return candidate.as_posix()
    checked = ", ".join(candidate.as_posix() for candidate in ROUTER_PATH_CANDIDATES)
    raise SystemExit(f"[build_site] Router SKILL.md not found; checked: {checked}")


def resolve_workflow_name(root: Path, candidates: tuple[str, ...]) -> str:
    workflows = root / ".github" / "workflows"
    for name in candidates:
        if (workflows / name).is_file():
            return name
    names = ", ".join(candidates)
    raise SystemExit(f"[build_site] Expected one workflow file in {{{names}}}, none found")


def load_skill_modules(root: Path, repo_raw: str, repo_github: str, repo_ref: str) -> tuple[list[dict], str]:
    plugin_path = require_file(root / DEFAULT_PLUGIN_PATH)
    skills_manifest_path = require_file(root / DEFAULT_SKILLS_MANIFEST_PATH)
    plugin = load_json_object(plugin_path)
    manifest = load_json_object(skills_manifest_path)

    plugin_name = required_nonempty_string_field(plugin, "name", plugin_path)
    plugin_skills = required_nonempty_list_field(plugin, "skills", plugin_path)
    manifest_skills = required_nonempty_list_field(manifest, "skills", skills_manifest_path)
    manifest_by_repo_path = build_manifest_index(manifest_skills)

    modules: list[dict] = []
    for entry in plugin_skills:
        if not isinstance(entry, str) or not entry.strip():
            raise SystemExit(f"[build_site] Invalid skill entry in plugin: {entry!r}")
        repo_path = normalize_skill_repo_path(entry)
        manifest_item = manifest_by_repo_path.get(repo_path)
        if manifest_item is None:
            raise SystemExit(
                f"[build_site] Skill from plugin not found in skills manifest: {repo_path}"
            )

        name = optional_nonempty_string_field(manifest_item, "name", Path(repo_path).name)
        description = optional_nonempty_string_field(manifest_item, "description", "Skill module")
        skill_md_path = optional_nonempty_string_field(manifest_item, "skill_md_path", f"{repo_path}/SKILL.md")

        module = {
            "name": name,
            "description": compact_markdown_text(description, limit=120),
            "sigil": skill_sigil(name),
            "repo_path": repo_path,
            "skill_path": skill_md_path,
            "raw_skill_url": raw_path_url(skill_md_path, repo_raw),
            "github_url": f"{repo_github}/blob/{repo_ref}/{skill_md_path}",
        }
        modules.append(module)

    if not modules:
        raise SystemExit("[build_site] No modules resolved from plugin + skills manifest")

    return modules, plugin_name


def fingerprint_files(root: Path, files: list[Path]) -> str:
    digest = hashlib.sha256()
    for path in sorted(set(files)):
        rel = path.relative_to(root).as_posix()
        digest.update(rel.encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()[:16]


def build_dataset(root: Path, repo_slug: str, repo_ref: str) -> dict:
    repo_github = f"https://github.com/{repo_slug}"
    repo_raw = f"https://raw.githubusercontent.com/{repo_slug}/{repo_ref}"
    modules, plugin_name = load_skill_modules(root, repo_raw=repo_raw, repo_github=repo_github, repo_ref=repo_ref)
    router_skill_path = resolve_router_skill_path(root)
    quality_workflow = resolve_workflow_name(root, QUALITY_WORKFLOW_CANDIDATES)
    full_evals_workflow = resolve_workflow_name(root, FULL_EVALS_WORKFLOW_CANDIDATES)

    cairo_auditor_module = next((item for item in modules if item["name"] == "cairo-auditor"), modules[0])
    cairo_auditor_readme_path = f"{cairo_auditor_module['repo_path']}/README.md"

    audits_manifest_path = require_file(root / "datasets/manifests/audits.jsonl")
    manifests = read_jsonl(audits_manifest_path)

    normalized_findings_dir = require_directory(root / "datasets/normalized/findings")
    normalized_findings_files = sorted(normalized_findings_dir.glob("*.jsonl"))
    if not normalized_findings_files:
        raise SystemExit(f"[build_site] No normalized finding files found in: {normalized_findings_dir}")
    normalized_findings = [
        finding
        for jsonl_path in normalized_findings_files
        for finding in read_jsonl(jsonl_path)
    ]
    finding_by_id = {
        item["finding_id"]: item
        for item in normalized_findings
        if item.get("finding_id")
    }

    normalized_audits_dir = require_directory(root / "datasets/normalized/audits")
    normalized_audits_files = sorted(normalized_audits_dir.glob("*.json"))
    normalized_audits_count = len(normalized_audits_files)

    segments_dir = require_directory(root / "datasets/segments")
    segment_files = sorted(segments_dir.glob("*.jsonl"))
    segments_count = len(segment_files)

    vuln_cards_dir = require_directory(root / "datasets/distilled/vuln-cards")
    vuln_card_paths = sorted(p for p in vuln_cards_dir.glob("*.md") if p.name != "README.md")
    fix_patterns_dir = require_directory(root / "datasets/distilled/fix-patterns")
    test_recipes_dir = require_directory(root / "datasets/distilled/test-recipes")
    fix_pattern_files = sorted(fix_patterns_dir.glob("*.md"))
    test_recipe_files = sorted(test_recipes_dir.glob("*.md"))
    scorecards_dir = require_directory(root / "evals/scorecards")
    scorecard_files = sorted(scorecards_dir.glob("v*.md"))

    vuln_cards: list[VulnCard] = []
    for card_path in vuln_card_paths:
        text = card_path.read_text(encoding="utf-8")
        sections = parse_card_sections(text)
        source_ids = parse_source_findings(sections.get("Source Findings", ""))
        sev_counter = Counter(
            finding_by_id[item_id].get("severity_normalized", "unknown")
            for item_id in source_ids
            if item_id in finding_by_id
        )
        vuln_cards.append(
            VulnCard(
                name=card_path.stem,
                path=card_path,
                trigger=compact_markdown_text(sections.get("Trigger", "")),
                detection_rule=compact_markdown_text(sections.get("Detection Rule", "")),
                source_findings=source_ids,
                severity_distribution=dict(sev_counter),
            )
        )

    deterministic_scorecard, contract_skill_scorecard, realworld_scorecard = pick_latest_scorecards(
        scorecards_dir
    )
    source_fingerprint = fingerprint_files(
        root,
        [
            audits_manifest_path,
            require_file(root / DEFAULT_PLUGIN_PATH),
            require_file(root / DEFAULT_SKILLS_MANIFEST_PATH),
            require_file(root / router_skill_path),
            *normalized_findings_files,
            *normalized_audits_files,
            *segment_files,
            *vuln_card_paths,
            *fix_pattern_files,
            *test_recipe_files,
            *scorecard_files,
        ],
    )

    return {
        "source_fingerprint": source_fingerprint,
        "counts": {
            "cataloged_audits": len(manifests),
            "segmented_audits": segments_count,
            "normalized_audits": normalized_audits_count,
            "normalized_findings": len(normalized_findings),
            "distilled_vuln_cards": len(vuln_cards),
            "distilled_fix_patterns": count_md_files(fix_patterns_dir),
            "distilled_test_recipes": count_md_files(test_recipes_dir),
            "skill_modules": len(modules),
            "skills_total_with_router": len(modules) + 1,
        },
        "latest_scorecards": {
            "deterministic": scorecard_to_dict(deterministic_scorecard, root, repo_github, repo_ref),
            "contract_skill": scorecard_to_dict(contract_skill_scorecard, root, repo_github, repo_ref),
            "realworld": scorecard_to_dict(realworld_scorecard, root, repo_github, repo_ref),
        },
        "modules": modules,
        "vuln_cards": [
            {
                "name": card.name,
                "trigger": card.trigger,
                "detection_rule": card.detection_rule,
                "source_findings": card.source_findings,
                "severity_distribution": card.severity_distribution,
                "github_url": github_blob(card.path, root, repo_github, repo_ref),
            }
            for card in vuln_cards
        ],
        "links": {
            "repo": repo_github,
            "repo_slug": repo_slug,
            "repo_ref": repo_ref,
            "plugin_name": plugin_name,
            "license": f"{repo_github}/blob/{repo_ref}/LICENSE",
            "router_skill_raw": raw_path_url(router_skill_path, repo_raw),
            "router_skill_github": f"{repo_github}/blob/{repo_ref}/{router_skill_path}",
            "quality_workflow": f"{repo_github}/actions/workflows/{quality_workflow}",
            "full_evals_workflow": f"{repo_github}/actions/workflows/{full_evals_workflow}",
            "heldout_policy": f"{repo_github}/blob/{repo_ref}/evals/heldout/README.md",
            "contributing": f"{repo_github}/blob/{repo_ref}/CONTRIBUTING.md",
            "cairo_auditor": cairo_auditor_module["github_url"],
            "cairo_auditor_readme": f"{repo_github}/blob/{repo_ref}/{cairo_auditor_readme_path}",
            "pipeline_readme": f"{repo_github}/blob/{repo_ref}/datasets/README.md",
            "vuln_cards_dir": f"{repo_github}/tree/{repo_ref}/datasets/distilled/vuln-cards",
        },
    }


def scorecard_to_dict(
    scorecard: ScorecardMetrics | None,
    root: Path,
    repo_github: str,
    repo_ref: str,
) -> dict | None:
    if scorecard is None:
        return None
    return {
        "path": scorecard.path.relative_to(root).as_posix(),
        "github_url": github_blob(scorecard.path, root, repo_github, repo_ref),
        "cases": scorecard.cases,
        "precision": scorecard.precision,
        "recall": scorecard.recall,
    }


def e(value: object) -> str:
    return html.escape(str(value), quote=True)


def fmt_int(value: int) -> str:
    return f"{value:,}"


def fmt_metric(value: int | float | None) -> str:
    if value is None:
        return "n/a"
    if isinstance(value, float):
        return f"{value:.1f}" if value.is_integer() else f"{value:.2f}".rstrip("0").rstrip(".")
    return str(value)


def severity_badges(counter: dict[str, int]) -> str:
    if not counter:
        return '<span class="pill pill-muted">none</span>'
    order = ["critical", "high", "medium", "low", "best_practice", "info", "unknown"]
    parts = []
    for key in order:
        if key not in counter:
            continue
        parts.append(f'<span class="pill">{e(key)}: {counter[key]}</span>')
    for key, value in sorted(counter.items()):
        if key in order:
            continue
        parts.append(f'<span class="pill">{e(key)}: {value}</span>')
    return "".join(parts)


def source_finding_links(ids: Iterable[str], repo_github: str) -> str:
    output: list[str] = []
    for item_id in ids:
        encoded_id = quote(item_id, safe="")
        output.append(
            (
                '<a class="finding-link" '
                f'href="{e(repo_github)}/search?q={e(encoded_id)}" '
                f'target="_blank" rel="noreferrer">{e(item_id)}</a>'
            )
        )
    return "".join(output) if output else '<span class="muted">none</span>'


def site_url(domain: str | None, path: str = "") -> str | None:
    if not domain:
        return None
    path = path.lstrip("/")
    return f"https://{domain}/{path}" if path else f"https://{domain}"


def head_meta(title: str, description: str, css_path: str, domain: str | None, page_path: str) -> str:
    canonical = site_url(domain, page_path)
    og_image = site_url(domain, "assets/og-card.png")
    favicon = site_url(domain, "assets/favicon.svg")
    meta = [
        '  <meta charset="utf-8" />',
        '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
        f"  <title>{e(title)}</title>",
        f'  <meta name="description" content="{e(description)}" />',
        '  <meta name="theme-color" content="#0a0a0a" />',
        '  <link rel="preconnect" href="https://fonts.googleapis.com" />',
        '  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />',
        '  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700;800&display=swap" rel="stylesheet" />',
        f'  <link rel="stylesheet" href="{e(css_path)}" />',
    ]
    if favicon:
        meta.append(f'  <link rel="icon" href="{e(favicon)}" type="image/svg+xml" />')
    if canonical:
        meta.extend(
            [
                f'  <link rel="canonical" href="{e(canonical)}" />',
                f'  <meta property="og:url" content="{e(canonical)}" />',
                '  <meta property="og:type" content="website" />',
                f'  <meta property="og:title" content="{e(title)}" />',
                f'  <meta property="og:description" content="{e(description)}" />',
                '  <meta name="twitter:card" content="summary_large_image" />',
                f'  <meta name="twitter:title" content="{e(title)}" />',
                f'  <meta name="twitter:description" content="{e(description)}" />',
            ]
        )
        if og_image:
            meta.extend(
                [
                    f'  <meta property="og:image" content="{e(og_image)}" />',
                    f'  <meta name="twitter:image" content="{e(og_image)}" />',
                ]
            )
    return "\n".join(meta)


def command_block(title: str, description: str, code: str, accent: str = "") -> str:
    safe_accent = re.sub(r"[^a-z0-9-]", "", accent.lower())
    modifier = f" command-card--{safe_accent}" if safe_accent else ""
    return (
        f'<article class="command-card{modifier} reveal">'
        '<div class="command-head">'
        f"<div><h2>{e(title)}</h2><p>{e(description)}</p></div>"
        f'<button class="copy-button" type="button" data-copy="{e(code)}" aria-label="Copy {e(title)}">copy</button>'
        "</div>"
        f'<pre><code>{e(code)}</code></pre>'
        "</article>"
    )


def module_card(item: dict) -> str:
    return (
        f'<article class="module-card reveal" data-href="{e(item["raw_skill_url"])}">'
        '<div class="module-head">'
        f'<span class="module-sigil">{e(item["sigil"])}</span>'
        '<span class="status">stable</span>'
        "</div>"
        f'<h3><a href="{e(item["raw_skill_url"])}" target="_blank" rel="noreferrer">{e(item["name"])}</a></h3>'
        f'<p>{e(item["description"])}</p>'
        '<div class="module-actions">'
        f'<button class="icon-button copy-button" type="button" data-copy="{e(item["raw_skill_url"])}" aria-label="Copy raw URL for {e(item["name"])}">cp</button>'
        f'<a class="icon-button" href="{e(item["raw_skill_url"])}" target="_blank" rel="noreferrer" aria-label="Open raw SKILL.md for {e(item["name"])}">raw</a>'
        f'<a class="icon-button" href="{e(item["github_url"])}" target="_blank" rel="noreferrer" aria-label="Open GitHub page for {e(item["name"])}">gh</a>'
        "</div>"
        "</article>"
    )


def pipeline_step(number: int, name: str, stat: str, note: str) -> str:
    return (
        '<article class="pipeline-step reveal">'
        f'<div class="step-index">{number:02d}</div>'
        f"<h3>{e(name)}</h3>"
        f'<div class="step-stat">{e(stat)}</div>'
        f'<p>{e(note)}</p>'
        "</article>"
    )


def verify_link(label: str, href: str, meta: str) -> str:
    return (
        f'<a class="verify-link reveal" href="{e(href)}" target="_blank" rel="noreferrer">'
        f'<span class="verify-name">{e(label)}</span>'
        f'<span class="verify-meta">{e(meta)}</span>'
        "</a>"
    )


def scorecard_metric(label: str, value: int | float | None) -> str:
    metric_value = fmt_metric(value)
    data_value = ""
    data_decimals = ""
    if isinstance(value, (int, float)):
        data_value = f' data-value="{value}"'
        decimals = metric_value.partition(".")[2]
        data_decimals = f' data-decimals="{len(decimals)}"'
    return (
        '<article class="score-metric reveal">'
        f'<p>{e(label)}</p>'
        f'<strong class="count-up"{data_value}{data_decimals}>{e(metric_value)}</strong>'
        "</article>"
    )


def shared_script() -> str:
    return """
<script>
(() => {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const setCopied = (button) => {
    const previous = button.textContent;
    button.textContent = 'copied';
    button.classList.add('is-copied');
    window.setTimeout(() => {
      button.textContent = previous;
      button.classList.remove('is-copied');
    }, 2000);
  };

  document.addEventListener('click', async (event) => {
    const copyButton = event.target.closest('.copy-button');
    if (copyButton) {
      const text = copyButton.getAttribute('data-copy');
      if (text) {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(copyButton);
        } catch (_error) {
          copyButton.textContent = 'failed';
          window.setTimeout(() => {
            copyButton.textContent = copyButton.classList.contains('icon-button') ? 'cp' : 'copy';
          }, 1500);
        }
      }
      return;
    }

    const card = event.target.closest('.module-card[data-href]');
    if (card && !event.target.closest('a, button')) {
      const href = card.getAttribute('data-href');
      if (href) {
        window.open(href, '_blank', 'noopener,noreferrer');
      }
    }
  });

  if (prefersReducedMotion) {
    document.querySelectorAll('.reveal').forEach((element) => element.classList.add('is-visible'));
    return;
  }

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.reveal').forEach((element) => revealObserver.observe(element));

  const countObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const element = entry.target;
      const target = Number(element.getAttribute('data-value'));
      if (!Number.isFinite(target)) {
        countObserver.unobserve(element);
        return;
      }
      const parsedDecimals = Number(element.getAttribute('data-decimals') ?? 0);
      const decimals = Number.isFinite(parsedDecimals) && parsedDecimals >= 0 ? parsedDecimals : 0;
      const duration = 450;
      const start = performance.now();
      const tick = (now) => {
        const progress = Math.min((now - start) / duration, 1);
        const value = target * progress;
        element.textContent = value.toFixed(decimals);
        if (progress < 1) {
          requestAnimationFrame(tick);
        } else {
          element.textContent = target.toFixed(decimals);
        }
      };
      requestAnimationFrame(tick);
      countObserver.unobserve(element);
    });
  }, { threshold: 0.3 });

  document.querySelectorAll('.count-up[data-value]').forEach((element) => countObserver.observe(element));
})();
</script>
""".strip()


def build_index_html(data: dict, domain: str | None) -> str:
    counts = data["counts"]
    links = data["links"]
    scorecard = data["latest_scorecards"].get("realworld") or data["latest_scorecards"].get("deterministic")

    stats_bar = "\n".join(
        [
            f'<span class="stat-pill">{fmt_int(counts["cataloged_audits"])} audits</span>',
            f'<span class="stat-pill">{fmt_int(counts["normalized_findings"])} findings</span>',
            f'<span class="stat-pill">{fmt_int(counts["skill_modules"])} modules</span>',
            '<span class="stat-pill">router</span>',
        ]
    )

    modules_html = "\n".join(module_card(item) for item in data["modules"])

    pipeline_html = "\n".join(
        [
            pipeline_step(1, "ingest", fmt_int(counts["cataloged_audits"]), "audit manifests"),
            pipeline_step(2, "segment", fmt_int(counts["segmented_audits"]), "segmented corpora"),
            pipeline_step(3, "normalize", fmt_int(counts["normalized_findings"]), "normalized findings"),
            pipeline_step(4, "distill", fmt_int(counts["distilled_vuln_cards"]), "vuln cards"),
            pipeline_step(5, "skillize", fmt_int(counts["skill_modules"]), "published modules"),
        ]
    )

    scorecard_html = ""
    scorecard_nav = ""
    if scorecard:
        scorecard_nav = '<a href="#scorecard">scorecard</a>'
        scorecard_html = (
            '<section class="section section-score reveal" id="scorecard">'
            '<div class="section-head">'
            '<div><p class="section-kicker">Scorecard</p><h2>Latest run</h2></div>'
            f'<a href="{e(scorecard["github_url"])}" target="_blank" rel="noreferrer">open scorecard</a>'
            '</div>'
            '<div class="score-grid">'
            f'{scorecard_metric("cases", scorecard.get("cases"))}'
            f'{scorecard_metric("precision", scorecard.get("precision"))}'
            f'{scorecard_metric("recall", scorecard.get("recall"))}'
            '</div>'
            '<p class="section-note">Benchmark snapshot from repo data. Informational only; not a security guarantee.</p>'
            '</section>'
        )

    verify_html = "\n".join(
        [
            verify_link("quality", links["quality_workflow"], "ci"),
            verify_link("evals", links["full_evals_workflow"], "workflow"),
            verify_link("held-out", links["heldout_policy"], "policy"),
            verify_link("contributing", links["contributing"], "guide"),
            verify_link("vuln cards", "vuln-cards/", "index"),
            verify_link("site data", "data/site-data.json", "json"),
        ]
    )

    primary_command = command_block("Raw URL", "Use the router skill directly.", links["router_skill_raw"], "primary")
    secondary_commands = "\n".join(
        [
            command_block(
                "Claude",
                "Install in Claude.",
                (
                    f"/plugin marketplace add {links['repo_slug']}\n"
                    f"/plugin install {links['plugin_name']}@{links['plugin_name']}"
                ),
            ),
            command_block("Git clone", "Clone the repo locally.", f"git clone {links['repo']}.git"),
        ]
    )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
{head_meta('starkskills', 'Cairo and Starknet skills, audit data, and direct links.', 'assets/site.css', domain, '')}
</head>
<body>
  <header class="topbar">
    <a class="brand" href="#top">starkskills</a>
    <nav class="site-nav" aria-label="Primary navigation">
      <a href="#skills">skills</a>
      <a href="#data">pipeline</a>
      {scorecard_nav}
      <a href="#verify">verify</a>
    </nav>
    <a class="nav-icon" href="{e(links['repo'])}" target="_blank" rel="noreferrer" aria-label="Open GitHub repository">gh</a>
  </header>

  <main class="shell" id="top">
    <section class="hero reveal">
      <pre class="ascii-logo" aria-label="STARKSKILLS">{e(ASCII_LOGO)}</pre>
      <h1>Cairo and Starknet skills for agents.</h1>
      <p class="hero-copy">Plain markdown skills, audit data, and direct links.</p>
      <div class="stats-bar">
        {stats_bar}
      </div>
      <div class="hero-install">
        {primary_command}
        <div class="command-stack">
          {secondary_commands}
        </div>
      </div>
    </section>

    <section class="section section-card reveal" id="showcase">
      <div class="section-head">
        <div>
          <p class="section-kicker">Example</p>
          <h2>cairo-auditor</h2>
        </div>
        <div class="section-links">
          <a href="{e(links['cairo_auditor'])}" target="_blank" rel="noreferrer">skill</a>
          <a href="{e(links['cairo_auditor_readme'])}" target="_blank" rel="noreferrer">readme</a>
        </div>
      </div>
      <p class="section-copy">One example module. Discover files, scan patterns, verify findings, write the report.</p>
      <ul class="workflow" aria-label="Audit workflow">
        <li><span>01</span> discover</li>
        <li><span>02</span> scan</li>
        <li><span>03</span> verify</li>
        <li><span>04</span> report</li>
      </ul>
    </section>

    <section class="section reveal" id="skills">
      <div class="section-head">
        <div>
          <p class="section-kicker">Skills</p>
          <h2>Index</h2>
        </div>
        <div class="section-links">
          <a href="{e(links['router_skill_github'])}" target="_blank" rel="noreferrer">router</a>
          <button class="copy-button inline-copy" type="button" data-copy="{e(links['router_skill_raw'])}">copy router url</button>
        </div>
      </div>
      <div class="module-grid">
        {modules_html}
      </div>
    </section>

    <section class="section reveal" id="data">
      <div class="section-head">
        <div>
          <p class="section-kicker">Pipeline</p>
          <h2>Data flow</h2>
        </div>
        <a href="{e(links['pipeline_readme'])}" target="_blank" rel="noreferrer">datasets</a>
      </div>
      <div class="pipeline-grid">
        {pipeline_html}
      </div>
      <p class="section-note">Counts are generated from repo data at build time.</p>
    </section>

    {scorecard_html}

    <section class="section reveal" id="verify">
      <div class="section-head">
        <div>
          <p class="section-kicker">Verify</p>
          <h2>Repo links</h2>
        </div>
        <a href="vuln-cards/">vuln cards</a>
      </div>
      <div class="verify-grid">
        {verify_html}
      </div>
    </section>
  </main>

  <footer class="footer">
    <div class="footer-links">
      <a href="{e(links['license'])}" target="_blank" rel="noreferrer">MIT License</a>
      <a href="{e(links['repo'])}" target="_blank" rel="noreferrer">GitHub</a>
      <a href="{e(links['contributing'])}" target="_blank" rel="noreferrer">Contributing</a>
    </div>
    <div class="fingerprint">$ fingerprint {e(data['source_fingerprint'])}</div>
  </footer>

  {shared_script()}
</body>
</html>
"""


def build_vuln_cards_html(data: dict, domain: str | None) -> str:
    repo_github = data["links"]["repo"]
    rows = [
        '<article class="vuln-card reveal">'
        '<div class="vuln-head">'
        f"<h3><a href=\"{e(card['github_url'])}\" target=\"_blank\" rel=\"noreferrer\">{e(card['name'])}</a></h3>"
        f"<div>{severity_badges(card['severity_distribution'])}</div>"
        "</div>"
        '<p class="meta-label">Trigger</p>'
        f"<p>{e(card['trigger'])}</p>"
        '<p class="meta-label">Detection</p>'
        f"<p>{e(card['detection_rule'])}</p>"
        '<p class="meta-label">Findings</p>'
        f"<div>{source_finding_links(card['source_findings'], repo_github)}</div>"
        "</article>"
        for card in data["vuln_cards"]
    ]

    row_markup = "\n".join(rows) if rows else '<article class="vuln-card"><p>No vuln cards published yet.</p></article>'
    counts = data["counts"]
    links = data["links"]

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
{head_meta('starkskills | vuln cards', 'Distilled vulnerability cards from Starknet audit findings.', '../assets/site.css', domain, 'vuln-cards/')}
</head>
<body>
  <header class="topbar">
    <a class="brand" href="../">starkskills</a>
    <nav class="site-nav" aria-label="Secondary navigation">
      <a href="../#skills">skills</a>
      <a href="../#verify">verify</a>
      <a href="../">home</a>
    </nav>
    <a class="nav-icon" href="{e(links['vuln_cards_dir'])}" target="_blank" rel="noreferrer" aria-label="Open vulnerability cards directory">gh</a>
  </header>

  <main class="shell">
    <section class="hero reveal">
      <pre class="ascii-logo ascii-logo--small" aria-label="STARKSKILLS">{e(ASCII_LOGO)}</pre>
      <h1>Vuln cards.</h1>
      <p class="hero-copy">Distilled classes from normalized findings.</p>
      <div class="stats-bar">
        <span class="stat-pill">{fmt_int(counts['distilled_vuln_cards'])} cards</span>
        <span class="stat-pill">{fmt_int(counts['normalized_findings'])} findings</span>
        <span class="stat-pill">{fmt_int(counts['cataloged_audits'])} audits</span>
      </div>
    </section>

    <section class="section reveal">
      <div class="section-head">
        <div>
          <p class="section-kicker">Index</p>
          <h2>Browse</h2>
        </div>
        <a href="{e(links['vuln_cards_dir'])}" target="_blank" rel="noreferrer">repo dir</a>
      </div>
      <div class="vuln-grid">
        {row_markup}
      </div>
    </section>
  </main>

  <footer class="footer">
    <div class="footer-links">
      <a href="../">Home</a>
      <a href="{e(links['repo'])}" target="_blank" rel="noreferrer">GitHub</a>
      <a href="../data/site-data.json">site-data.json</a>
    </div>
    <div class="fingerprint">$ fingerprint {e(data['source_fingerprint'])}</div>
  </footer>

  {shared_script()}
</body>
</html>
"""


def build_og_card_svg(domain: str | None) -> str:
    label = domain or "starkskills"
    logo_lines = "&#10;".join(html.escape(line) for line in ASCII_LOGO.splitlines()[:3])
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="starkskills">
  <rect width="1200" height="630" fill="#0a0a0a"/>
  <rect x="56" y="56" width="1088" height="518" rx="20" fill="#101010" stroke="#242424"/>
  <text x="88" y="140" font-family="monospace" font-size="26" fill="#00d4aa" xml:space="preserve">{logo_lines}</text>
  <text x="88" y="340" font-family="monospace" font-size="38" fill="#e0e0e0">Cairo and Starknet skills for agents.</text>
  <text x="88" y="392" font-family="sans-serif" font-size="26" fill="#a0a0a0">Plain markdown skills, audit data, and direct links.</text>
  <text x="88" y="500" font-family="monospace" font-size="24" fill="#00d4aa">{html.escape(label)}</text>
</svg>
"""


def copy_static_assets(source_assets_dir: Path, output_assets_dir: Path) -> None:
    require_directory(source_assets_dir)
    output_assets_dir.mkdir(parents=True, exist_ok=True)
    required_assets = ("site.css", "favicon.svg", "og-card.png")
    for asset_name in required_assets:
        source = require_file(source_assets_dir / asset_name)
        shutil.copy2(source, output_assets_dir / asset_name)


def validate_generated_content(output_dir: Path, data: dict, repo_slug: str) -> None:
    index_path = output_dir / "index.html"
    data_path = output_dir / "data" / "site-data.json"
    index_text = require_file(index_path).read_text(encoding="utf-8")
    data_text = require_file(data_path).read_text(encoding="utf-8")

    for module in data.get("modules", []):
        raw_url = module.get("raw_skill_url", "")
        if "/skills/" not in raw_url:
            raise SystemExit(f"[build_site] Generated module URL missing /skills/ segment: {raw_url}")

    if repo_slug != LEGACY_REPO_SLUG and "keep-starknet-strange/starknet-skills" in index_text:
        raise SystemExit("[build_site] Generated index still references legacy starknet-skills slug")
    if repo_slug != LEGACY_REPO_SLUG and "keep-starknet-strange/starknet-skills" in data_text:
        raise SystemExit("[build_site] Generated site-data still references legacy starknet-skills slug")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--repo-root",
        default=".",
        help="Path to repository root (default: current directory)",
    )
    parser.add_argument(
        "--domain",
        default=None,
        help="Optional production domain to write into OUTPUT_DIR/CNAME",
    )
    parser.add_argument(
        "--repo-slug",
        default=DEFAULT_REPO_SLUG,
        help="Repository slug used for generated links (OWNER/REPO).",
    )
    parser.add_argument(
        "--repo-ref",
        default=DEFAULT_REPO_REF,
        help="Repository ref used for generated links (branch, tag, or commit).",
    )
    parser.add_argument(
        "--output-dir",
        default=DEFAULT_OUTPUT_DIR,
        help="Output directory for generated static site (default: starkskills-site).",
    )
    parser.add_argument(
        "--assets-dir",
        default=None,
        help="Optional source assets directory (default: scripts/starkskills_site/assets).",
    )
    parser.add_argument(
        "--skip-validation",
        action="store_true",
        help="Skip post-build content validation checks.",
    )
    args = parser.parse_args()

    root = Path(args.repo_root).resolve()
    output_arg = Path(args.output_dir)
    output_dir = output_arg if output_arg.is_absolute() else root / output_arg
    assets_dir = (
        Path(args.assets_dir).resolve()
        if args.assets_dir
        else Path(__file__).resolve().parent / "assets"
    )
    cname_path = output_dir / "CNAME"

    try:
        repo_slug = normalize_repo_slug(args.repo_slug)
        repo_ref = normalize_repo_ref(args.repo_ref)
    except ValueError as exc:
        raise SystemExit(f"[build_site] {exc}") from exc
    try:
        domain = normalize_domain(args.domain)
    except ValueError as exc:
        if cname_path.exists():
            cname_path.unlink()
        raise SystemExit(f"[build_site] {exc}") from exc

    data = build_dataset(root, repo_slug=repo_slug, repo_ref=repo_ref)

    (output_dir / "assets").mkdir(parents=True, exist_ok=True)
    (output_dir / "data").mkdir(parents=True, exist_ok=True)
    (output_dir / "vuln-cards").mkdir(parents=True, exist_ok=True)

    copy_static_assets(assets_dir, output_dir / "assets")

    (output_dir / "data/site-data.json").write_text(
        json.dumps(data, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    (output_dir / "index.html").write_text(build_index_html(data, domain), encoding="utf-8")
    (output_dir / "vuln-cards/index.html").write_text(build_vuln_cards_html(data, domain), encoding="utf-8")
    (output_dir / "assets/og-card.svg").write_text(build_og_card_svg(domain), encoding="utf-8")

    # Ensure GitHub Pages serves paths literally and applies custom domain when configured.
    (output_dir / ".nojekyll").write_text("\n", encoding="utf-8")
    if domain:
        cname_path.write_text(domain + "\n", encoding="utf-8")
    elif cname_path.exists():
        cname_path.unlink()

    if not args.skip_validation:
        validate_generated_content(output_dir, data, repo_slug=repo_slug)


if __name__ == "__main__":
    main()
