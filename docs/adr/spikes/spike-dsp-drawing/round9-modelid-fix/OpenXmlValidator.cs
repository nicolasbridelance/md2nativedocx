using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Validation;

if (args.Length < 1)
{
    Console.WriteLine("Usage: dotnet run <path-to-docx> [OpenXmlVersion: 2007|2010|2013|2016]");
    return 1;
}

string path = args[0];
var versionArg = args.Length > 1 ? args[1] : "2016";
FileFormatVersions version = versionArg switch
{
    "2007" => FileFormatVersions.Office2007,
    "2010" => FileFormatVersions.Office2010,
    "2013" => FileFormatVersions.Office2013,
    _ => FileFormatVersions.Office2016,
};

using var doc = WordprocessingDocument.Open(path, false);
var validator = new OpenXmlValidator(version);
var errors = validator.Validate(doc).ToList();

Console.WriteLine($"File: {path}");
Console.WriteLine($"Validated against: {version}");
Console.WriteLine($"Error count: {errors.Count}");
Console.WriteLine();

foreach (var error in errors)
{
    Console.WriteLine("----------------------------------------");
    Console.WriteLine($"Part: {error.Part?.Uri}");
    Console.WriteLine($"Path: {error.Path?.XPath}");
    Console.WriteLine($"Description: {error.Description}");
    Console.WriteLine($"ErrorType: {error.ErrorType}");
}

return errors.Count > 0 ? 1 : 0;
