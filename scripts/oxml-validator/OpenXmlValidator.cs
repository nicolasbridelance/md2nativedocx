// Wraps DocumentFormat.OpenXml.Validation.OpenXmlValidator (Microsoft's Open XML SDK) --
// validates a .docx against the exact same schema real Word enforces strictly, unlike
// well-formed-XML checks or LibreOffice (which performs no schema validation at all).
//
// Why this exists: TODO.md's "Incident SmartArt 'cycle' cassé en Word réel" cost 7 rounds
// of manually-compared, individually-disproven structural hypotheses before this tool found
// the actual cause (an invalid `modelId` scheme) in a single pass -- see
// docs/adr/0006-dsp-drawing-fallback-spike.md for the full story and
// docs/adr/spikes/spike-dsp-drawing/round9-modelid-fix/ for how it was first used here.
// AGENTS.md's "Diagnosing 'Word won't open the file'" section makes this the mandatory
// first step for that class of bug, before any manual XML comparison.
//
// Usage:
//   dotnet run -- <path-to-docx> [--version 2007|2010|2013|2016] [--json]
//
// Exit code 0 means zero schema violations; 1 means at least one was found (or the file
// could not be opened/parsed at all).
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Validation;
using System.Text.Json;

var positional = new List<string>();
string versionArg = "2016";
bool json = false;
for (var i = 0; i < args.Length; i++)
{
    if (args[i] == "--version" && i + 1 < args.Length)
    {
        versionArg = args[++i];
    }
    else if (args[i] == "--json")
    {
        json = true;
    }
    else
    {
        positional.Add(args[i]);
    }
}

if (positional.Count < 1)
{
    Console.Error.WriteLine("Usage: dotnet run -- <path-to-docx> [--version 2007|2010|2013|2016] [--json]");
    return 1;
}

string path = positional[0];
FileFormatVersions version = versionArg switch
{
    "2007" => FileFormatVersions.Office2007,
    "2010" => FileFormatVersions.Office2010,
    "2013" => FileFormatVersions.Office2013,
    _ => FileFormatVersions.Office2016,
};

List<ErrorRecord> errors;
try
{
    using var doc = WordprocessingDocument.Open(path, false);
    var validator = new OpenXmlValidator(version);
    // Materialize into a plain record *while the package is still open* --
    // ValidationErrorInfo.Part/.Path are lazy-ish wrappers over the
    // package's own parts, which throw once the package is disposed (found
    // running this: `using var doc` closes the package at scope exit, and
    // a deferred LINQ projection over `errors` after that point touches a
    // closed package).
    errors = validator.Validate(doc)
        .Select(e => new ErrorRecord(e.Part?.Uri?.ToString(), e.Path?.XPath, e.Description, e.ErrorType.ToString()))
        .ToList();
}
catch (Exception ex)
{
    if (json)
    {
        Console.WriteLine(JsonSerializer.Serialize(new { file = path, openError = ex.Message }));
    }
    else
    {
        Console.Error.WriteLine($"Could not open/parse '{path}': {ex.Message}");
    }
    return 1;
}

if (json)
{
    var report = new { file = path, validatedAgainst = version.ToString(), errorCount = errors.Count, errors };
    Console.WriteLine(JsonSerializer.Serialize(report));
}
else
{
    Console.WriteLine($"File: {path}");
    Console.WriteLine($"Validated against: {version}");
    Console.WriteLine($"Error count: {errors.Count}");
    Console.WriteLine();

    foreach (var error in errors)
    {
        Console.WriteLine("----------------------------------------");
        Console.WriteLine($"Part: {error.Part}");
        Console.WriteLine($"Path: {error.Path}");
        Console.WriteLine($"Description: {error.Description}");
        Console.WriteLine($"ErrorType: {error.ErrorType}");
    }
}

return errors.Count > 0 ? 1 : 0;

record ErrorRecord(string? Part, string? Path, string? Description, string ErrorType);
