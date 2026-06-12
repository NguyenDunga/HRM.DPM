using System;
using Newtonsoft.Json;

namespace TestApp
{
    class Program
    {
        static void Main(string[] args)
        {
            Console.WriteLine("Hello World! .NET Framework 4.8.1 Test Project");
            
            // Test Newtonsoft.Json package
            var testObject = new { Name = "Test", Version = "1.0.0" };
            string json = JsonConvert.SerializeObject(testObject);
            Console.WriteLine($"JSON: {json}");
            
            Console.WriteLine("Press any key to exit...");
            Console.ReadKey();
        }
    }
}