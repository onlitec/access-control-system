program demoMG3000;

uses
  Forms,
  uprincipal in 'uprincipal.pas' {fprincipal};

{$R *.res}

begin
  Application.Initialize;
  Application.Title := 'Demo Nice MG3000';
  Application.CreateForm(Tfprincipal, fprincipal);
  Application.Run;
end.
